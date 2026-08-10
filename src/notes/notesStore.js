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

    /** Bloques con marcador, para pintar la barra al margen. Los resaltados
     *  no cuentan: ya se ven pintados sobre su propio texto. */
    get markedBlocks () {
      return new Set(notes.filter(n => n.kind !== 'highlight').map(n => n.block))
    },

    find (offset) { return notes.find(n => n.offset === offset) ?? null },

    /**
     * Un marcador de linea o, con end/kind/color, un resaltado de texto.
     */
    add ({ offset, block, char, quote, end, kind, color }) {
      const existing = notes.find(n => n.offset === offset && (n.kind === kind || (!n.kind && !kind)))
      if (existing) return existing

      const note = {
        id: `${offset}-${Date.now()}`,
        offset,
        block,
        char,
        quote: quote.slice(0, QUOTE_CHARS),
        text: '',
        createdAt: Date.now(),
        ...(end != null ? { end } : {}),
        ...(kind ? { kind } : {}),
        ...(color ? { color } : {})
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
