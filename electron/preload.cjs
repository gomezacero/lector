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
    remove: id => ipcRenderer.invoke('library:remove', id)
  },
  book: {
    readCache: id => ipcRenderer.invoke('book:readCache', id),
    writeCache: (id, book) => ipcRenderer.invoke('book:writeCache', id, book)
  },
  notes: {
    read: id => ipcRenderer.invoke('notes:read', id),
    write: (id, notes) => ipcRenderer.invoke('notes:write', id, notes)
  },
  settings: {
    read: () => ipcRenderer.invoke('settings:read'),
    write: s => ipcRenderer.invoke('settings:write', s)
  },
  // Los atajos del menu viven en el proceso principal y llegan aqui como eventos.
  onMenu: handlers => {
    for (const [action, fn] of Object.entries(handlers)) {
      ipcRenderer.on(`menu:${action}`, () => fn())
    }
  }
})
