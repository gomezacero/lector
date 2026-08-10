// Migraciones del Book cacheado y re-anclaje del progreso y las notas.
//
// Cuando el pipeline cambia, el numero de version sube y el cache viejo queda
// atras. Antes eso significaba reprocesar el libro y confiar en que los
// offsets no se movieran; el comentario de la v4 lo comprobaba "a mano, sobre
// seis libros". Aqui vive la garantia estructural: cada version sabe si el
// cache anterior se puede transformar en sitio o hay que reprocesar, y cuando
// los offsets si se mueven, el punto de lectura y las notas se buscan de nuevo
// por su texto en vez de perderse en silencio.
//
// Este modulo es puro a proposito: no importa ni pdf.js ni nada del lector,
// para poder probarlo en vitest con los fixtures reales.

// Cuanto texto se guarda junto al offset para poder re-anclarlo. Corto no
// distingue frases parecidas; largo se rompe con cualquier cambio menor de
// extraccion. 80 caracteres suelen cubrir una linea entera de texto.
const CONTEXT_CHARS = 80

// Con menos que esto la busqueda encuentra coincidencias por todas partes y
// el re-anclaje se vuelve una loteria: mejor caer al fallback por pagina.
const MIN_CONTEXT = 12

// Cada migracion recibe el Book de su version y devuelve { book } si puede
// transformarlo en sitio —solo cuando el cambio no movio ni el texto ni los
// offsets— o { rebuild: true } si hace falta reprocesar el PDF.
const MIGRATIONS = {
  // v5 anade pageKinds (que clase de pagina es cada una) y admite source y
  // confidence por bloque. Nada de eso se deriva del cache: las paginas
  // quedan como desconocidas y los bloques nativos ya son el valor implicito.
  4: book => ({ book: { ...book, version: 5, pageKinds: book.pageSizes.map(() => null) } }),
  // v6 clasifica las paginas de verdad, y clasificar exige mirar el PDF.
  5: () => ({ rebuild: true }),
  // v7 marca las paginas de referencia y mide la tipografia por pagina: los
  // bloques de los preliminares cambian de texto y de offsets.
  6: () => ({ rebuild: true }),
  // v8 marca las portadillas, y reconocerlas exige las lineas de la pagina.
  7: () => ({ rebuild: true })
}

/**
 * Lleva un cache viejo hasta la version pedida, encadenando migraciones.
 * @param {Object} cached Book leido de disco
 * @param {number} target version a alcanzar (CACHE_VERSION del pipeline; se
 *   pasa como argumento para que este modulo no dependa de pdf.js)
 * @returns {{book: Object}|{rebuild: true}}
 */
export function migrateBook (cached, target) {
  let book = cached
  while (book.version < target) {
    const step = MIGRATIONS[book.version]
    if (!step) return { rebuild: true }
    const result = step(book)
    if (result.rebuild) return { rebuild: true }
    book = result.book
  }
  return { book }
}

/**
 * Comprobaciones minimas de que un Book es usable. Devuelve la lista de
 * problemas; vacia si esta bien. Un cache que no valida se reprocesa en vez
 * de dejar el lector a medias con datos rotos.
 *
 * Deliberadamente tolerante con las coordenadas: hay libros reales con rects
 * fuera de la pagina —"Fisica Universitaria" trae alguno en y = -21— y eso lo
 * recorta el lector, no es un cache corrupto.
 */
export function validateBook (book) {
  const problems = []
  if (!book || typeof book !== 'object') return ['no es un objeto']

  if (!Array.isArray(book.blocks)) problems.push('sin lista de bloques')
  if (!Array.isArray(book.pageSizes) || book.pageSizes.length !== book.pageCount) {
    problems.push('pageSizes no cuadra con pageCount')
  }
  if (book.pageKinds !== undefined &&
      (!Array.isArray(book.pageKinds) || book.pageKinds.length !== book.pageCount)) {
    problems.push('pageKinds no cuadra con pageCount')
  }

  if (Array.isArray(book.blocks)) {
    // Los offsets son el ancla de todo lo guardado: si no son la suma exacta
    // de los textos, el progreso y las notas senalarian cualquier otra frase.
    let chars = 0
    for (const [i, block] of book.blocks.entries()) {
      if (block.start !== chars) { problems.push(`offset roto en el bloque ${i}`); break }
      chars += block.text.length + 1
      for (const rect of block.rects ?? []) {
        if (!(rect.page >= 0 && rect.page < book.pageCount)) {
          problems.push(`bloque ${i} apunta a una pagina inexistente`)
          break
        }
      }
    }
    if (!problems.some(p => p.startsWith('offset')) && book.blocks.length && book.chars !== chars) {
      problems.push('chars no es la suma de los bloques')
    }
  }

  for (const chapter of book.chapters ?? []) {
    if (!(chapter.start >= 0 && chapter.end > chapter.start)) {
      problems.push('capitulo con limites invertidos')
      break
    }
  }

  return problems
}

/** El texto completo del libro, con los offsets alineados: el bloque i empieza
 *  exactamente en blocks[i].start porque el separador mide un caracter. */
export function textOf (book) {
  return book.blocks.map(b => b.text).join('\n')
}

// La misma busqueda binaria que blockAtOffset en el lector. Se repite aqui
// para que este modulo siga siendo puro, sin arrastrar nada de src/reader.
function blockIndexAt (book, offset) {
  const blocks = book.blocks
  if (!blocks.length) return 0
  let lo = 0
  let hi = blocks.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (blocks[mid].start <= offset) lo = mid
    else hi = mid - 1
  }
  return lo
}

/**
 * El texto que empieza justo en un offset, cruzando bloques si hace falta.
 * Empieza en el offset y no alrededor: asi coincide con la cita que guardan
 * las notas y no hay que recordar en que punto del extracto caia el ancla.
 */
export function contextAt (book, offset, span = CONTEXT_CHARS) {
  const blocks = book.blocks
  if (!blocks.length) return ''

  let i = blockIndexAt(book, offset)
  let out = ''
  let from = Math.max(0, offset - blocks[i].start)
  while (out.length < span && i < blocks.length) {
    out += blocks[i].text.slice(from)
    from = 0
    i += 1
    if (out.length < span && i < blocks.length) out += '\n'
  }
  return out.slice(0, span)
}

/**
 * Busca en el libro nuevo el punto que un offset senalaba en el viejo.
 *
 * Por orden: el texto guardado junto al ancla (o extraido del cache viejo,
 * que en el momento de migrar sigue en disco), la pagina, y como ultimo
 * recurso la proporcion. El fallback garantiza no perderlo todo: solo
 * precision.
 *
 * @param {Object|null} oldBook cache anterior, si aun existe
 * @param {Object} newBook libro reprocesado
 * @param {{offset:number, context?:string, page?:number|null}} target
 * @returns {number} offset en el libro nuevo
 */
export function reanchor (oldBook, newBook, target) {
  const text = textOf(newBook)
  const scale = oldBook?.chars > 0 ? newBook.chars / oldBook.chars : 1
  const expected = Math.round((target.offset ?? 0) * scale)

  const context = (target.context ?? (oldBook ? contextAt(oldBook, target.offset) : '')).trim()

  // El extracto completo primero; si la extraccion cambio hacia el final del
  // extracto —una palabra partida de otra forma, un espacio de mas— la mitad
  // inicial todavia puede anclar.
  for (const needle of [context, context.slice(0, Math.floor(context.length / 2))]) {
    if (needle.length < MIN_CONTEXT) continue
    const found = nearestIndex(text, needle, expected)
    if (found !== -1) return found
  }

  // Sin texto que buscar, la pagina es el ancla que sobrevive a cualquier
  // reproceso, incluido un OCR que reescriba cada palabra.
  if (target.page != null) {
    const block = newBook.blocks.find(b => b.page === target.page)
    if (block) return block.start
  }

  return Math.max(0, Math.min(expected, Math.max(0, newBook.chars - 1)))
}

/** Aparicion de la aguja mas cercana a la posicion esperada, o -1. Se miran
 *  todas porque un extracto corto puede repetirse y la primera puede estar a
 *  cientos de paginas del punto real. */
function nearestIndex (text, needle, expected) {
  let best = -1
  let at = text.indexOf(needle)
  while (at !== -1) {
    if (best === -1 || Math.abs(at - expected) < Math.abs(best - expected)) best = at
    at = text.indexOf(needle, at + 1)
  }
  return best
}
