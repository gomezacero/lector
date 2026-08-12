// Marcadores y notas de un libro.
//
// Se anclan al offset de caracter, igual que el progreso, para que sigan
// senalando la misma frase aunque cambie la tipografia. Se guarda tambien un
// extracto del texto: asi la lista de notas se lee sin abrir el libro.

const QUOTE_CHARS = 180

export function createNotesStore (bookId) {
  let notes = []
  let pending = Promise.resolve()
  let idSequence = 0

  const sort = () => notes.sort((a, b) => a.offset - b.offset)
  const queue = operation => {
    pending = pending.catch(() => {}).then(operation)
    pending.catch(err => window.lector.log?.error?.(`notas: ${err.message}`))
    return pending
  }

  return {
    async load () {
      notes = (await window.lector.notes.read(bookId)) ?? []
      sort()
      return notes
    },

    get all () { return notes },

    flush: () => pending,

    find (offset) { return notes.find(n => n.offset === offset) ?? null },

    /** Encuentra un marcador de lectura, nunca un resaltado. El bloque y el
     * caracter permiten reconocer la misma linea aunque el locator conservado
     * apunte unos caracteres dentro de ella. */
    findBookmark (location) {
      const offset = typeof location === 'number' ? location : location?.offset
      const block = typeof location === 'object' ? location?.block : null
      const char = typeof location === 'object' ? location?.char : null
      const end = typeof location === 'object' ? location?.end : null
      return notes.find(note => note.kind !== 'highlight' && (
        note.offset === offset ||
        (block != null && char != null && note.block === block && (
          note.char === char || (end != null && note.char >= char && note.char < end)
        ))
      )) ?? null
    },

    /**
     * Un marcador de linea o, con end/kind/color, un resaltado de texto.
     */
    add ({ offset, block, char, quote, end, kind, color }) {
      const existing = notes.find(n => n.offset === offset && (n.kind === kind || (!n.kind && !kind)))
      if (existing) return existing

      const note = {
        // Dos acciones distintas pueden ocurrir en el mismo milisegundo
        // (marcar y resaltar desde automatizacion, doble clic, etc.). Sin la
        // secuencia compartirian id y borrar una se llevaria tambien la otra.
        id: `${offset}-${Date.now()}-${idSequence++}`,
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
      queue(() => window.lector.notes.add(bookId, note))
      return note
    },

    setText (id, text) {
      const note = notes.find(n => n.id === id)
      if (!note) return
      note.text = text
      queue(() => window.lector.notes.edit(bookId, id, text))
    },

    remove (id) {
      notes = notes.filter(n => n.id !== id)
      queue(() => window.lector.notes.remove(bookId, id))
    }
  }
}
