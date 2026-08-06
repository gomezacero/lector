// Marcadores y notas de un libro.
//
// Se anclan al offset de caracter, igual que el progreso, para que sigan
// senalando la misma frase aunque cambie la tipografia. Se guarda tambien un
// extracto del texto: asi la lista de notas se lee sin abrir el libro.

const QUOTE_CHARS = 180

export function createNotesStore (bookId) {
  let notes = []

  const sort = () => notes.sort((a, b) => a.offset - b.offset)
  const persist = () => window.lector.notes.write(bookId, notes)

  return {
    async load () {
      notes = (await window.lector.notes.read(bookId)) ?? []
      sort()
      return notes
    },

    get all () { return notes },

    /** Bloques con marcador, para pintar la barra al margen. */
    get markedBlocks () { return new Set(notes.map(n => n.block)) },

    find (offset) { return notes.find(n => n.offset === offset) ?? null },

    add ({ offset, block, char, quote }) {
      const existing = notes.find(n => n.offset === offset)
      if (existing) return existing

      const note = {
        id: `${offset}-${Date.now()}`,
        offset,
        block,
        char,
        quote: quote.slice(0, QUOTE_CHARS),
        text: '',
        createdAt: Date.now()
      }
      notes.push(note)
      sort()
      persist()
      return note
    },

    setText (id, text) {
      const note = notes.find(n => n.id === id)
      if (!note) return
      note.text = text
      persist()
    },

    remove (id) {
      notes = notes.filter(n => n.id !== id)
      persist()
    }
  }
}
