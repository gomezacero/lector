// Bloques -> capitulos.
//
// Tres fuentes, por orden de fiabilidad: el indice que declara el PDF, los
// titulos detectados por tipografia y, si no hay nada, un troceado por tamano
// para que el lector nunca tenga que renderizar el libro entero de golpe.

const FALLBACK_CHUNK = 100 // bloques por seccion cuando no hay estructura

// Tope de bloques que el lector pinta de golpe. El capitulo se dibuja entero
// y en dos capas: uno de mil y pico bloques ("Fisica Universitaria" trae uno
// de 1495) son miles de nodos y cientos de miles de caracteres en el DOM, y
// cada re-maquetado los vuelve a medir todos.
export const MAX_CHAPTER_BLOCKS = 300

/** Primer bloque que cae en esa pagina, prefiriendo un titulo si lo hay. */
function blockAtPage (blocks, page, fromIndex = 0) {
  let candidate = -1
  for (let i = fromIndex; i < blocks.length; i++) {
    if (blocks[i].page < page) continue
    if (candidate === -1) candidate = i
    if (blocks[i].page > page) break
    if (blocks[i].type === 'heading') return i
  }
  return candidate
}

function fromOutline (blocks, outline) {
  // Los PDF suelen anidar partes y secciones; para leer basta el nivel mas alto.
  const topDepth = Math.min(...outline.map(e => e.depth))
  const entries = outline.filter(e => e.depth === topDepth && usefulOutlineTitle(e.title))

  const marks = []
  let cursor = 0
  for (const entry of entries) {
    const index = blockAtPage(blocks, entry.page, cursor)
    if (index === -1) continue
    // Varias entradas en la misma pagina apuntarian al mismo bloque.
    if (marks.length && index <= marks[marks.length - 1].start) continue
    marks.push({ title: entry.title, start: index })
    cursor = index
  }
  return marks
}

// Algunos ensambladores conservan como marcadores los nombres de los PDF que
// concatenaron ("SinTitulo1.pdf (p.3-14)"). No describen la obra y desplazan
// la estructura tipográfica real, así que no merecen la prioridad del índice.
function usefulOutlineTitle (title) {
  const value = String(title ?? '').trim()
  if (!value) return false
  if (/^(?:sin\s*t[ií]tulo|untitled)\s*\d*/iu.test(value)) return false
  return !/\.pdf(?:\s|\(|$)/iu.test(value)
}

function fromHeadings (blocks) {
  const marks = []
  blocks.forEach((block, i) => {
    if (block.type === 'heading') marks.push({ title: block.text, start: i })
  })
  return marks
}

function fromChunks (blocks) {
  const marks = []
  for (let i = 0; i < blocks.length; i += FALLBACK_CHUNK) {
    marks.push({ title: `Sección ${marks.length + 1}`, start: i })
  }
  return marks
}

// Un diario no declara capitulos: cada entrada se abre con una fecha suelta
// ("Sábado 23 de febrero") que la deteccion de titulos no ve, porque suele ir
// en cursiva y en cuerpo pequeño. Si el libro trae bastantes lineas asi, esas
// fechas SON su estructura.
const WEEKDAYS = 'lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo'
const MONTHS = 'enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre'
const DATE_LINE = new RegExp(
  `^(?:(?:${WEEKDAYS}),?\\s+)?\\d{1,2}\\s+de\\s+(?:${MONTHS})(?:\\s+de\\s+\\d{4})?$`, 'i')

// Con menos que esto es una carta o una dedicatoria, no un diario.
const MIN_DATE_MARKS = 3

/** Bloques que son solo una fecha: la linea entera, no una mencion en prosa. */
function fromDates (blocks) {
  const marks = []
  blocks.forEach((block, i) => {
    const text = block.text.trim()
    if (text.length <= 40 && DATE_LINE.test(text)) marks.push({ title: text, start: i })
  })
  return marks.length >= MIN_DATE_MARKS ? marks : []
}

/**
 * @param {Array} blocks
 * @param {Array<{title:string, page:number, depth:number}>} outline
 * @returns {Array<{title:string, start:number, end:number}>} end exclusivo
 */
export function buildChapters (blocks, outline = []) {
  if (!blocks.length) return []

  let marks = outline.length ? fromOutline(blocks, outline) : []
  if (marks.length < 2) {
    // Sin indice fiable, compiten los titulos y las fechas de diario: gana lo
    // que mas estructura aporte. El indice del PDF, cuando existe, no se toca.
    const headings = fromHeadings(blocks)
    const dates = fromDates(blocks)
    marks = dates.length > headings.length ? dates : headings
  }
  if (marks.length < 2) marks = fromChunks(blocks)

  return toChapters(marks, blocks.length)
}

/** Marcas -> capitulos cerrados, con el tramo previo al primero incluido. */
function toChapters (marks, blockCount) {
  // Lo que quede antes del primer titulo tambien hay que poder leerlo.
  if (!marks.length || marks[0].start > 0) {
    marks = [{ title: 'Comienzo', start: 0 }, ...marks]
  }

  return marks
    .map((mark, i) => ({
      title: mark.title.trim() || `Sección ${i + 1}`,
      start: mark.start,
      end: i + 1 < marks.length ? marks[i + 1].start : blockCount
    }))
    .filter(chapter => chapter.end > chapter.start)
}

/**
 * Parte los capitulos que superan MAX_CHAPTER_BLOCKS en tramos parejos y
 * numerados ("Mecánica (2/5)"). No toca ni bloques ni offsets: el progreso y
 * las notas anclan por caracter y ni se enteran.
 *
 * Se aplica despues de detectar portadillas, no dentro de buildChapters: las
 * paginas donde arranca cada tramo intermedio no son principios de capitulo
 * de verdad y no deben entrar como candidatas a portadilla.
 */
/**
 * Migración v10: recapitula en sitio un cache cuyo libro es un diario.
 *
 * Solo actúa sobre capítulos sin estructura real —un único título troceado en
 * tramos, o las "Sección N" de relleno— y cuando los bloques traen fechas
 * suficientes. Unos capítulos con títulos de verdad no se tocan: vinieran del
 * índice del PDF o de la tipografía, saben más que esta heurística. No toca
 * ni bloques ni offsets.
 */
export function rechapterFromDates (book) {
  const out = { ...book, version: 10 }
  const dates = fromDates(book.blocks ?? [])
  if (!dates.length || !looksStructureless(book.chapters ?? [])) return out
  out.chapters = splitLongChapters(toChapters(dates, book.blocks.length))
  return out
}

function looksStructureless (chapters) {
  if (!chapters.length) return true
  const bases = new Set(chapters.map(c => c.title.replace(/ \(\d+\/\d+\)$/, '')))
  if (bases.size <= 2) return true
  return [...bases].every(title => /^Sección \d+$/.test(title))
}

export function splitLongChapters (chapters) {
  const out = []
  for (const chapter of chapters) {
    const size = chapter.end - chapter.start
    if (size <= MAX_CHAPTER_BLOCKS) {
      out.push(chapter)
      continue
    }
    const count = Math.ceil(size / MAX_CHAPTER_BLOCKS)
    const per = Math.ceil(size / count)
    for (let i = 0; i < count; i++) {
      out.push({
        title: `${chapter.title} (${i + 1}/${count})`,
        start: chapter.start + i * per,
        end: Math.min(chapter.end, chapter.start + (i + 1) * per)
      })
    }
  }
  return out
}
