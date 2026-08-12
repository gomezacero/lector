const { contextBridge, ipcRenderer } = require('electron')

// Solo lo pone la tarea de desarrollo "read"; en uso normal es null.
const devFlag = process.argv.find(arg => arg.startsWith('--lector-dev-open='))
const devOpen = devFlag ? devFlag.slice('--lector-dev-open='.length) : null
const devStudy = process.argv.includes('--lector-study')

// Unica superficie que el renderer ve del proceso principal.
// Nada de acceso directo a Node: solo estas llamadas concretas.
contextBridge.exposeInMainWorld('lector', {
  devOpen,
  devStudy,
  pdf: {
    pick: () => ipcRenderer.invoke('pdf:pick'),
    load: filePath => ipcRenderer.invoke('pdf:load', filePath)
  },
  library: {
    list: () => ipcRenderer.invoke('library:list'),
    upsert: entry => ipcRenderer.invoke('library:upsert', entry),
    saveProgress: (id, progress, lastOpenedAt) =>
      ipcRenderer.invoke('library:saveProgress', id, progress, lastOpenedAt),
    updateReading: (id, reading, readingMode) =>
      ipcRenderer.invoke('library:updateReading', id, reading, readingMode),
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
    replace: (id, notes) => ipcRenderer.invoke('notes:replace', id, notes),
    add: (id, note) => ipcRenderer.invoke('notes:add', id, note),
    edit: (id, noteId, text) => ipcRenderer.invoke('notes:edit', id, noteId, text),
    remove: (id, noteId) => ipcRenderer.invoke('notes:remove', id, noteId),
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
  vocabulary: {
    read: id => ipcRenderer.invoke('vocabulary:read', id),
    add: (id, item) => ipcRenderer.invoke('vocabulary:add', id, item),
    clear: id => ipcRenderer.invoke('vocabulary:clear', id)
  },
  stats: {
    read: id => ipcRenderer.invoke('stats:read', id),
    write: (id, data) => ipcRenderer.invoke('stats:write', id, data),
    clear: id => ipcRenderer.invoke('stats:clear', id)
  },
  study: {
    export: data => ipcRenderer.invoke('study:export', data)
  },
  settings: {
    read: () => ipcRenderer.invoke('settings:read'),
    write: s => ipcRenderer.invoke('settings:write', s)
  },
  app: {
    flush: () => ipcRenderer.invoke('app:flush'),
    isFullscreen: () => ipcRenderer.invoke('app:isFullscreen'),
    setFullscreen: value => ipcRenderer.invoke('app:setFullscreen', value),
    closeReady: () => ipcRenderer.send('app:closeReady')
  },
  // Errores del renderer hacia el log persistente del proceso principal.
  log: {
    error: message => ipcRenderer.send('log:error', String(message).slice(0, 4000))
  },
  // Avisos del almacen (un fichero corrupto apartado): se ensenan al usuario.
  onStorageWarning: fn => {
    ipcRenderer.on('storage:warning', (_e, message) => fn(String(message)))
  },
  onNotice: fn => {
    ipcRenderer.on('app:notice', (_e, message) => fn(String(message)))
  },
  onBeforeClose: fn => {
    ipcRenderer.on('app:before-close', () => fn())
  },
  onFullscreen: fn => {
    ipcRenderer.on('app:fullscreen', (_e, value) => fn(Boolean(value)))
  },
  // Los atajos del menu viven en el proceso principal y llegan aqui como eventos.
  onMenu: handlers => {
    for (const [action, fn] of Object.entries(handlers)) {
      ipcRenderer.on(`menu:${action}`, () => fn())
    }
  }
})
