// Puertos de persistencia del proceso principal. main.js expresa intenciones;
// storage.js conserva los detalles de JSON, rutas, colas y atomicidad.

export function createRepositories (storage) {
  return {
    library: {
      list: () => storage.readLibrary(),
      upsert: entry => storage.upsertLibraryEntry(entry),
      saveProgress: (id, progress, lastOpenedAt) =>
        storage.saveLibraryProgress(id, progress, lastOpenedAt),
      updateReading: (id, reading, mode) => storage.updateBookReading(id, reading, mode),
      remove: id => storage.removeLibraryEntry(id),
      usage: id => storage.bookUsage(id)
    },
    books: {
      read: id => storage.readBookCache(id),
      write: (id, book) => storage.writeBookCache(id, book),
      hasCover: id => storage.hasCover(id),
      writeCover: (id, bytes) => storage.writeCover(id, bytes)
    },
    notes: {
      read: id => storage.readNotes(id),
      replace: (id, notes) => storage.writeNotes(id, notes),
      add: (id, note) => storage.addNote(id, note),
      edit: (id, noteId, text) => storage.editNote(id, noteId, text),
      remove: (id, noteId) => storage.removeNote(id, noteId)
    },
    ocr: {
      read: id => storage.readOcr(id),
      write: (id, data) => storage.writeOcr(id, data)
    },
    layout: {
      read: id => storage.readLayout(id),
      write: (id, data) => storage.writeLayout(id, data)
    },
    vocabulary: {
      read: id => storage.readVocabulary(id),
      add: (id, item) => storage.addVocabulary(id, item),
      clear: id => storage.clearVocabulary(id)
    },
    stats: {
      read: id => storage.readReadingStats(id),
      write: (id, data) => storage.writeReadingStats(id, data),
      clear: id => storage.clearReadingStats(id)
    },
    settings: {
      read: () => storage.readSettings(),
      write: settings => storage.writeSettings(settings)
    },
    flush: () => storage.flushWrites()
  }
}
