import { app, BrowserWindow, Menu, dialog, ipcMain, protocol, shell } from 'electron'
import { createHash } from 'node:crypto'
import { promises as fs, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as store from './storage.js'
import { createRepositories } from './repositories.js'
import { isExternalUrl, isPathInside } from './security.js'
import { logLine } from './log.js'
import { attachErrorLog, runDevTask, startUrlFor } from './devtasks.js'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repositories = createRepositories(store)

// Empaquetada, la aplicacion es una GUI sin consola: un fallo que solo llegue
// a stderr no lo ve nadie. Todo lo no capturado queda en userData/logs.
process.on('uncaughtException', err => {
  console.error(err)
  logLine('main', `uncaughtException: ${err?.stack ?? err}`)
})
process.on('unhandledRejection', reason => {
  console.error(reason)
  logLine('main', `unhandledRejection: ${reason?.stack ?? reason}`)
})

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
  '.onnx': 'application/octet-stream',
  '.data': 'application/octet-stream',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.map': 'application/json',
  // El motor de OCR compila su nucleo con instantiateStreaming, que exige
  // este tipo exacto; con el generico de reserva el arranque falla.
  '.wasm': 'application/wasm'
}

function registerAppProtocol () {
  protocol.handle('app', async request => {
    const { pathname } = new URL(request.url)
    const decoded = decodeURIComponent(pathname)

    // Las portadas no viven en el proyecto sino junto a la biblioteca, asi que
    // tienen su propia rama; el resto sale del codigo empaquetado.
    // El id siempre es 32 hex (sha256 recortado): mismo formato que exige storage.
    const cover = decoded.match(/^\/covers\/([a-f0-9]{32})\.jpg$/)
    const target = cover
      ? store.coverPath(cover[1])
      : path.join(projectRoot, decoded)

    // Nada fuera de la raiz del proyecto, pase lo que pase con la URL.
    if (!cover && !target.startsWith(projectRoot + path.sep)) {
      return new Response('Forbidden', { status: 403 })
    }
    const type = MIME[path.extname(target).toLowerCase()] ?? 'application/octet-stream'
    try {
      // Un HEAD pregunta si el recurso existe (asi comprueba el lector si el
      // modelo de layout esta instalado): responder leyendo el fichero entero
      // cargaba 61 MB de ONNX en cada apertura de libro.
      if (request.method === 'HEAD') {
        const { size } = await fs.stat(target)
        return new Response(null, {
          headers: { 'content-type': type, 'content-length': String(size) }
        })
      }
      const body = await fs.readFile(target)
      return new Response(body, { headers: { 'content-type': type } })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}

let mainWindow = null
let closeReady = false
let closeFallback = null

// El arnes de desarrollo ejecuta JavaScript arbitrario en el renderer y borra
// datos: en la aplicacion empaquetada solo se activa con la segunda senal
// explicita, para que una variable de entorno colada no baste.
const tasksAllowed = !app.isPackaged || process.env.LECTOR_ALLOW_TASKS === '1'
const devTask = tasksAllowed ? (process.env.LECTOR_TASK ?? null) : null
const devTaskArg = process.env.LECTOR_TASK_ARG ?? null

// Dos instancias escribirian sobre el mismo library.json a la vez. Las tareas
// de desarrollo quedan fuera: usan datos propios y a veces conviven con la
// aplicacion abierta.
if (!devTask && !app.requestSingleInstanceLock()) {
  app.quit()
} else if (!devTask) {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })
}

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
  closeReady = false
  if (closeFallback) clearTimeout(closeFallback)
  closeFallback = null
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
      additionalArguments: ['read', 'home', 'study', 'visual'].includes(devTask) && devTaskArg
        ? [`--lector-dev-open=${devTaskArg}`, ...(devTask === 'study' ? ['--lector-study'] : [])]
        : [],
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
    if (devTask === 'read' || devTask === 'home' || devTask === 'visual') mainWindow.showInactive()
  })
  mainWindow.loadURL(startUrlFor(devTask, devTaskArg))
  mainWindow.on('enter-full-screen', () => send('app:fullscreen', true))
  mainWindow.on('leave-full-screen', () => send('app:fullscreen', false))

  if (devTask) {
    attachErrorLog(mainWindow)
    runDevTask(app, mainWindow, projectRoot, devTask, devTaskArg)
  }

  // Los enlaces externos van al navegador, nunca abren ventanas de Electron.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalUrl(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  // Y la propia ventana tampoco navega fuera de la aplicacion: un enlace con
  // target _self o un location.assign no deben sacar al lector de app://.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('app://')) return
    event.preventDefault()
    if (isExternalUrl(url)) shell.openExternal(url)
  })

  // La aplicacion no usa camara, microfono, geolocalizacion ni notificaciones:
  // denegarlo todo hace verificable la promesa de "no toca nada del sistema".
  mainWindow.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => {
    callback(false)
  })

  // El renderer vacia progreso, notas y ajustes antes de que se destruya su
  // contexto. Un segundo intento, ya confirmado, cierra de verdad.
  mainWindow.on('close', event => {
    if (closeReady || devTask) return
    event.preventDefault()
    send('app:before-close')
    // Un renderer colgado no puede convertir el boton de cerrar en una trampa.
    if (!closeFallback) {
      closeFallback = setTimeout(() => {
        closeReady = true
        mainWindow?.close()
      }, 8000)
    }
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
        { label: 'Exportar respaldo…', click: exportBackup },
        { type: 'separator' },
        { role: 'quit', label: 'Salir' }
      ]
    },
    {
      label: 'Lectura',
      submenu: [
        { label: 'Ajustes', accelerator: 'CmdOrCtrl+,', click: () => send('menu:settings') },
        { label: 'Notas y marcadores', accelerator: 'CmdOrCtrl+B', click: () => send('menu:notes') },
        { label: 'Buscar en el libro', accelerator: 'CmdOrCtrl+F', click: () => send('menu:search') },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Pantalla completa' }
      ]
    },
    {
      label: 'Ayuda',
      submenu: [
        { label: 'Exportar diagnóstico…', click: exportDiagnostics }
      ]
    },
    // Recargar y las DevTools son herramientas de quien desarrolla, no del
    // lector: empaquetada, la aplicacion no las ensena.
    ...(app.isPackaged
      ? []
      : [{
          label: 'Ver',
          submenu: [
            { role: 'reload', label: 'Recargar' },
            { role: 'toggleDevTools', label: 'Herramientas de desarrollo' }
          ]
        }])
  ]))
}

async function loadPdf (filePath) {
  const bytes = await fs.readFile(filePath)
  const id = createHash('sha256').update(bytes).digest('hex').slice(0, 32)
  allowedBookIds.add(id)
  return {
    id,
    path: filePath,
    fileName: path.basename(filePath),
    size: bytes.byteLength,
    // Uint8Array cruza el puente IPC sin copiarse a string.
    bytes: new Uint8Array(bytes)
  }
}

// pdf:load devuelve al renderer el contenido integro de la ruta que le pidan,
// asi que solo puede servir lo que el usuario haya senalado: rutas elegidas en
// el dialogo durante esta sesion o presentes en la biblioteca. Las tareas de
// desarrollo cargan fixtures arbitrarios y trabajan sobre datos propios, por
// eso quedan fuera de la restriccion.
const pickedPdfPaths = new Set()
const allowedBookIds = new Set()

async function allowedPdfPath (filePath) {
  if (devTask) return true
  if (typeof filePath !== 'string') return false
  const resolved = path.resolve(filePath)
  if (pickedPdfPaths.has(resolved)) return true
  const known = (await repositories.library.list()).some(b => b.path && path.resolve(b.path) === resolved)
  if (known) pickedPdfPaths.add(resolved)
  return known
}

async function assertAllowedEntryPath (entry) {
  if (entry?.path) {
    if (!(await allowedPdfPath(entry.path))) throw new Error('ruta de biblioteca no autorizada')
    return
  }
  const exists = (await repositories.library.list()).some(saved => saved.id === entry?.id)
  if (!exists) throw new Error('el libro no pertenece a la biblioteca')
}

async function assertAllowedBookId (id) {
  if (allowedBookIds.has(id)) return
  const exists = (await repositories.library.list()).some(saved => saved.id === id)
  if (!exists) throw new Error('el libro no pertenece a la biblioteca')
  allowedBookIds.add(id)
}

const backupStamp = () => new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')

async function exportBackup () {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Dónde guardar el respaldo',
    properties: ['openDirectory', 'createDirectory']
  })
  if (canceled || !filePaths[0]) return

  const source = path.resolve(app.getPath('userData'))
  const target = path.resolve(filePaths[0], `Lector-respaldo-${backupStamp()}`)
  if (isPathInside(source, target)) {
    send('app:notice', 'El respaldo debe guardarse fuera de los datos de Lector.')
    return
  }

  try {
    await repositories.flush()
    await fs.mkdir(target, { recursive: true })
    for (const name of ['library.json', 'settings.json', 'books', 'covers']) {
      await fs.cp(path.join(source, name), path.join(target, name), { recursive: true }).catch(err => {
        if (err.code !== 'ENOENT') throw err
      })
    }
    await fs.writeFile(path.join(target, 'respaldo.json'), JSON.stringify({
      format: 1,
      appVersion: app.getVersion(),
      createdAt: new Date().toISOString()
    }, null, 2), 'utf8')
    send('app:notice', `Respaldo guardado en ${target}`)
  } catch (err) {
    logLine('backup', err?.stack ?? err)
    send('app:notice', `No se pudo crear el respaldo: ${err.message}`)
  }
}

async function exportDiagnostics () {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Guardar diagnóstico de Lector',
    defaultPath: `Lector-diagnostico-${backupStamp()}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  })
  if (canceled || !filePath) return

  try {
    await repositories.flush()
    const library = await repositories.library.list()
    const settings = await repositories.settings.read()
    const logPath = path.join(app.getPath('userData'), 'logs', 'lector.log')
    const log = await fs.readFile(logPath, 'utf8').catch(() => '')
    const report = {
      generatedAt: new Date().toISOString(),
      application: { version: app.getVersion(), electron: process.versions.electron, node: process.versions.node },
      platform: { name: process.platform, release: process.getSystemVersion(), arch: process.arch },
      library: library.map(book => ({
        id: book.id,
        title: book.title,
        fileName: book.path ? path.basename(book.path) : null,
        pageCount: book.pageCount,
        cacheVersion: book.version,
        missing: Boolean(book.missing)
      })),
      settings,
      log: log.slice(-200_000)
    }
    await fs.writeFile(filePath, JSON.stringify(report, null, 2), 'utf8')
    send('app:notice', `Diagnóstico guardado en ${filePath}`)
  } catch (err) {
    logLine('diagnostics', err?.stack ?? err)
    send('app:notice', `No se pudo exportar el diagnóstico: ${err.message}`)
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
    pickedPdfPaths.add(path.resolve(filePaths[0]))
    return loadPdf(filePaths[0])
  })

  ipcMain.handle('pdf:load', async (_e, filePath) => {
    try {
      if (!(await allowedPdfPath(filePath))) {
        logLine('main', `pdf:load rechazado: ${String(filePath).slice(0, 200)}`)
        return { error: 'esa ruta no pertenece a la biblioteca' }
      }
      return await loadPdf(filePath)
    } catch (err) {
      return { error: err.code === 'ENOENT' ? 'missing' : err.message }
    }
  })

  // Tras leer, cualquier aviso del almacen (un fichero corrupto apartado) se
  // reenvia a la ventana para que lo vea el usuario, no solo el log.
  const withWarnings = fn => async (...args) => {
    try {
      return await fn(...args)
    } finally {
      for (const message of store.takeWarnings()) send('storage:warning', message)
    }
  }

  ipcMain.handle('library:list', withWarnings(() => repositories.library.list()))
  ipcMain.handle('library:upsert', async (_e, entry) => {
    await assertAllowedEntryPath(entry)
    return repositories.library.upsert(entry)
  })
  ipcMain.handle('library:saveProgress', (_e, id, progress, lastOpenedAt) =>
    repositories.library.saveProgress(id, progress, lastOpenedAt))
  ipcMain.handle('library:updateReading', (_e, id, reading, readingMode) =>
    repositories.library.updateReading(id, reading, readingMode))
  ipcMain.handle('library:remove', (_e, id) => repositories.library.remove(id))
  ipcMain.handle('library:usage', (_e, id) => repositories.library.usage(id))

  ipcMain.handle('book:readCache', withWarnings(async (_e, id) => {
    await assertAllowedBookId(id)
    return repositories.books.read(id)
  }))
  ipcMain.handle('book:writeCache', async (_e, id, book) => {
    await assertAllowedBookId(id)
    return repositories.books.write(id, book)
  })
  ipcMain.handle('book:hasCover', async (_e, id) => {
    await assertAllowedBookId(id)
    return repositories.books.hasCover(id)
  })
  ipcMain.handle('book:writeCover', async (_e, id, bytes) => {
    await assertAllowedBookId(id)
    return repositories.books.writeCover(id, bytes)
  })

  ipcMain.handle('notes:read', withWarnings(async (_e, id) => {
    await assertAllowedBookId(id)
    return repositories.notes.read(id)
  }))
  ipcMain.handle('notes:replace', async (_e, id, notes) => {
    await assertAllowedBookId(id)
    return repositories.notes.replace(id, notes)
  })
  ipcMain.handle('notes:add', async (_e, id, note) => {
    await assertAllowedBookId(id)
    return repositories.notes.add(id, note)
  })
  ipcMain.handle('notes:edit', async (_e, id, noteId, text) => {
    await assertAllowedBookId(id)
    return repositories.notes.edit(id, noteId, text)
  })
  ipcMain.handle('notes:remove', async (_e, id, noteId) => {
    await assertAllowedBookId(id)
    return repositories.notes.remove(id, noteId)
  })

  // Exportar notas: se escribe SOLO donde el usuario elija en el dialogo.
  ipcMain.handle('notes:export', async (_e, suggestedName, markdown) => {
    if (typeof markdown !== 'string' || !markdown.length) return null
    const name = typeof suggestedName === 'string'
      ? path.basename(suggestedName).replace(/[\\/:*?"<>|]/g, '') || 'notas.md'
      : 'notas.md'
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Guardar citas y notas',
      defaultPath: name,
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    })
    if (canceled || !filePath) return null
    await fs.writeFile(filePath, markdown, 'utf8')
    return filePath
  })

  ipcMain.handle('ocr:read', async (_e, id) => {
    await assertAllowedBookId(id)
    return repositories.ocr.read(id)
  })
  ipcMain.handle('ocr:write', async (_e, id, data) => {
    await assertAllowedBookId(id)
    return repositories.ocr.write(id, data)
  })

  ipcMain.handle('layout:read', async (_e, id) => {
    await assertAllowedBookId(id)
    return repositories.layout.read(id)
  })
  ipcMain.handle('layout:write', async (_e, id, data) => {
    await assertAllowedBookId(id)
    return repositories.layout.write(id, data)
  })

  ipcMain.handle('vocabulary:read', async (_e, id) => {
    await assertAllowedBookId(id)
    return repositories.vocabulary.read(id)
  })
  ipcMain.handle('vocabulary:add', async (_e, id, item) => {
    await assertAllowedBookId(id)
    return repositories.vocabulary.add(id, item)
  })
  ipcMain.handle('vocabulary:clear', async (_e, id) => {
    await assertAllowedBookId(id)
    return repositories.vocabulary.clear(id)
  })
  ipcMain.handle('stats:read', async (_e, id) => {
    await assertAllowedBookId(id)
    return repositories.stats.read(id)
  })
  ipcMain.handle('stats:write', async (_e, id, data) => {
    await assertAllowedBookId(id)
    return repositories.stats.write(id, data)
  })
  ipcMain.handle('stats:clear', async (_e, id) => {
    await assertAllowedBookId(id)
    return repositories.stats.clear(id)
  })
  ipcMain.handle('study:export', async (_e, data) => {
    if (!devTask) throw new Error('el estudio solo esta disponible en tareas de desarrollo')
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new TypeError('estudio invalido')
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Exportar estudio local',
      defaultPath: `Lector-estudio-${backupStamp()}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (canceled || !filePath) return null
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8')
    return filePath
  })

  ipcMain.handle('settings:read', withWarnings(() => repositories.settings.read()))
  ipcMain.handle('settings:write', (_e, s) => repositories.settings.write(s))
  ipcMain.handle('app:flush', () => repositories.flush())
  ipcMain.handle('app:isFullscreen', () => Boolean(mainWindow?.isFullScreen()))
  ipcMain.handle('app:setFullscreen', (_e, value) => {
    mainWindow?.setFullScreen(Boolean(value))
    return Boolean(value)
  })
  ipcMain.on('app:closeReady', () => {
    closeReady = true
    if (closeFallback) clearTimeout(closeFallback)
    closeFallback = null
    mainWindow?.close()
  })

  // Errores del renderer: la unica forma de que queden en el log del usuario.
  ipcMain.on('log:error', (_e, message) => {
    if (typeof message === 'string') logLine('renderer', message.slice(0, 4000))
  })
}

// Si el renderer muere (un PDF que agota la memoria, un fallo de Chromium),
// sin esto el usuario se queda mirando una ventana en blanco sin explicacion.
// Las tareas de desarrollo ya lo escuchan por su cuenta y quieren ver el fallo.
app.on('render-process-gone', (_e, _contents, details) => {
  logLine('main', `render-process-gone: ${JSON.stringify(details)}`)
  if (devTask || details.reason === 'clean-exit' || details.reason === 'killed') return
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.reload()
})

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
