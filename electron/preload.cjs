const { contextBridge, ipcRenderer } = require('electron')

// Solo lo pone la tarea de desarrollo "read"; en uso normal es null.
const devFlag = process.argv.find(arg => arg.startsWith('--lector-dev-open='))
const devOpen = devFlag ? devFlag.slice('--lector-dev-open='.length) : null

// Unica superficie que el renderer ve del proceso principal.
// Nada de acceso directo a Node: solo estas llamadas concretas.
contextBridge.exposeInMainWorld('lector', {
  devOpen,
  pdf: {
    pick: () => ipcRenderer.invoke('pdf:pick'),
    load: filePath => ipcRenderer.invoke('pdf:load', filePath)
  },
  library: {
    list: () => ipcRenderer.invoke('library:list'),
    upsert: entry => ipcRenderer.invoke('library:upsert', entry),
    remove: id => ipcRenderer.invoke('library:remove', id),
    usage: id => ipcRenderer.invoke('library:usage', id)
  },
  book: {
    readCache: id => ipcRenderer.invoke('book:readCache', id),
    writeCache: (id, book) => ipcRenderer.invoke('book:writeCache', id, book),
    hasCover: id => ipcRenderer.invoke('book:hasCover', id),
    writeCover: (id, bytes) => ipcRenderer.invoke('book:writeCover', id, bytes)
  },
  notes: {
    read: id => ipcRenderer.invoke('notes:read', id),
    write: (id, notes) => ipcRenderer.invoke('notes:write', id, notes),
    // Exportar citas y notas: el destino lo elige el usuario en el dialogo.
    export: (suggestedName, markdown) => ipcRenderer.invoke('notes:export', suggestedName, markdown)
  },
  ocr: {
    read: id => ipcRenderer.invoke('ocr:read', id),
    write: (id, data) => ipcRenderer.invoke('ocr:write', id, data)
  },
  layout: {
    read: id => ipcRenderer.invoke('layout:read', id),
    write: (id, data) => ipcRenderer.invoke('layout:write', id, data)
  },
  settings: {
    read: () => ipcRenderer.invoke('settings:read'),
    write: s => ipcRenderer.invoke('settings:write', s)
  },
  // Errores del renderer hacia el log persistente del proceso principal.
  log: {
    error: message => ipcRenderer.send('log:error', String(message).slice(0, 4000))
  },
  // Avisos del almacen (un fichero corrupto apartado): se ensenan al usuario.
  onStorageWarning: fn => {
    ipcRenderer.on('storage:warning', (_e, message) => fn(String(message)))
  },
  // Los atajos del menu viven en el proceso principal y llegan aqui como eventos.
  onMenu: handlers => {
    for (const [action, fn] of Object.entries(handlers)) {
      ipcRenderer.on(`menu:${action}`, () => fn())
    }
  }
})
