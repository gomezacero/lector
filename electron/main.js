import { app, BrowserWindow, Menu, dialog, ipcMain, protocol, shell } from 'electron'
import { createHash } from 'node:crypto'
import { promises as fs, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as store from './storage.js'
import { attachErrorLog, runDevTask, startUrlFor } from './devtasks.js'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// El renderer usa modulos ESM nativos, que el protocolo file:// bloquea por CORS.
// Un scheme propio y privilegiado los sirve sin necesidad de bundler.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }
])

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.map': 'application/json'
}

function registerAppProtocol () {
  protocol.handle('app', async request => {
    const { pathname } = new URL(request.url)
    const decoded = decodeURIComponent(pathname)

    // Las portadas no viven en el proyecto sino junto a la biblioteca, asi que
    // tienen su propia rama; el resto sale del codigo empaquetado.
    const cover = decoded.match(/^\/covers\/([a-f0-9]{8,64})\.jpg$/)
    const target = cover
      ? store.coverPath(cover[1])
      : path.join(projectRoot, decoded)

    // Nada fuera de la raiz del proyecto, pase lo que pase con la URL.
    if (!cover && !target.startsWith(projectRoot + path.sep)) {
      return new Response('Forbidden', { status: 403 })
    }
    try {
      const body = await fs.readFile(target)
      const type = MIME[path.extname(target).toLowerCase()] ?? 'application/octet-stream'
      return new Response(body, { headers: { 'content-type': type } })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}

let mainWindow = null

const devTask = process.env.LECTOR_TASK ?? null
const devTaskArg = process.env.LECTOR_TASK_ARG ?? null

// Las tareas de desarrollo trabajan sobre datos propios y recien borrados: asi
// cada ejecucion parte de cero y no tocan la biblioteca de verdad. Van al
// temporal del sistema y no al proyecto, para que tambien funcionen contra la
// aplicacion ya empaquetada, donde el directorio de instalacion es de solo
// lectura.
if (devTask) {
  const scratch = path.join(app.getPath('temp'), 'lector-devtask')
  // LECTOR_KEEP conserva los datos entre ejecuciones, para poder comprobar lo
  // que la aplicacion recuerda de una sesion a la siguiente.
  if (!process.env.LECTOR_KEEP) rmSync(scratch, { recursive: true, force: true })
  app.setPath('userData', scratch)
}

function createWindow () {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 860,
    minWidth: 560,
    minHeight: 480,
    backgroundColor: '#14161a',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(projectRoot, 'electron', 'preload.cjs'),
      // Las tareas de desarrollo abren un PDF concreto sin pasar por el dialogo.
      additionalArguments: (devTask === 'read' || devTask === 'home') && devTaskArg ? [`--lector-dev-open=${devTaskArg}`] : [],
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  })

  mainWindow.once('ready-to-show', () => {
    if (!devTask) return mainWindow.show()
    // Una ventana oculta no se compone: capturePage devolveria un fotograma
    // viejo. Se muestra sin robar el foco solo cuando la tarea hace capturas.
    if (devTask === 'read' || devTask === 'home') mainWindow.showInactive()
  })
  mainWindow.loadURL(startUrlFor(devTask, devTaskArg))

  if (devTask) {
    attachErrorLog(mainWindow)
    runDevTask(app, mainWindow, projectRoot, devTask, devTaskArg)
  }

  // Los enlaces externos van al navegador, nunca abren ventanas de Electron.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

function send (channel, payload) {
  mainWindow?.webContents.send(channel, payload)
}

function buildMenu () {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'Archivo',
      submenu: [
        { label: 'Abrir PDF...', accelerator: 'CmdOrCtrl+O', click: () => send('menu:open-pdf') },
        { label: 'Biblioteca', accelerator: 'CmdOrCtrl+L', click: () => send('menu:library') },
        { type: 'separator' },
        { role: 'quit', label: 'Salir' }
      ]
    },
    {
      label: 'Lectura',
      submenu: [
        { label: 'Ajustes', accelerator: 'CmdOrCtrl+,', click: () => send('menu:settings') },
        { label: 'Notas y marcadores', accelerator: 'CmdOrCtrl+B', click: () => send('menu:notes') },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Pantalla completa' }
      ]
    },
    {
      label: 'Ver',
      submenu: [
        { role: 'reload', label: 'Recargar' },
        { role: 'toggleDevTools', label: 'Herramientas de desarrollo' }
      ]
    }
  ]))
}

async function loadPdf (filePath) {
  const bytes = await fs.readFile(filePath)
  return {
    id: createHash('sha256').update(bytes).digest('hex').slice(0, 32),
    path: filePath,
    fileName: path.basename(filePath),
    size: bytes.byteLength,
    // Uint8Array cruza el puente IPC sin copiarse a string.
    bytes: new Uint8Array(bytes)
  }
}

function registerIpc () {
  ipcMain.handle('pdf:pick', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Abrir un PDF',
      properties: ['openFile'],
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (canceled || filePaths.length === 0) return null
    return loadPdf(filePaths[0])
  })

  ipcMain.handle('pdf:load', async (_e, filePath) => {
    try {
      return await loadPdf(filePath)
    } catch (err) {
      return { error: err.code === 'ENOENT' ? 'missing' : err.message }
    }
  })

  ipcMain.handle('library:list', () => store.readLibrary())
  ipcMain.handle('library:upsert', (_e, entry) => store.upsertLibraryEntry(entry))
  ipcMain.handle('library:remove', (_e, id) => store.removeLibraryEntry(id))
  ipcMain.handle('library:usage', (_e, id) => store.bookUsage(id))

  ipcMain.handle('book:readCache', (_e, id) => store.readBookCache(id))
  ipcMain.handle('book:writeCache', (_e, id, book) => store.writeBookCache(id, book))
  ipcMain.handle('book:hasCover', (_e, id) => store.hasCover(id))
  ipcMain.handle('book:writeCover', (_e, id, bytes) => store.writeCover(id, bytes))

  ipcMain.handle('notes:read', (_e, id) => store.readNotes(id))
  ipcMain.handle('notes:write', (_e, id, notes) => store.writeNotes(id, notes))

  ipcMain.handle('settings:read', () => store.readSettings())
  ipcMain.handle('settings:write', (_e, s) => store.writeSettings(s))
}

app.whenReady().then(() => {
  registerAppProtocol()
  registerIpc()
  buildMenu()
  createWindow()

  // Cache y portadas que ya no pertenecen a ningun libro. Nadie mas recorre
  // esos directorios, asi que sin esto lo que se caiga de library.json queda
  // ocupando disco para siempre. No se espera: la ventana ya esta en marcha.
  //
  // Las tareas de desarrollo se lo saltan: varias trabajan sobre un userData
  // propio y no tienen por que tocar la biblioteca de quien las ejecuta.
  if (!process.env.LECTOR_TASK) {
    store.sweepOrphans().catch(err => console.error('barrido:', err.message))
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
