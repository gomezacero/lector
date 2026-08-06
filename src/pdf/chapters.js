// Bloques -> capitulos.
//
// Tres fuentes, por orden de fiabilidad: el indice que declara el PDF, los
// titulos detectados por tipografia y, si no hay nada, un troceado por tamano
// para que el lector nunca tenga que renderizar el libro entero de golpe.

const FALLBACK_CHUNK = 100 // bloques por seccion cuando no hay estructura

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
  const entries = outline.filter(e => e.depth === topDepth)

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

/**
 * @param {Array} blocks
 * @param {Array<{title:string, page:number, depth:number}>} outline
 * @returns {Array<{title:string, start:number, end:number}>} end exclusivo
 */
export function buildChapters (blocks, outline = []) {
  if (!blocks.length) return []

  let marks = outline.length ? fromOutline(blocks, outline) : []
  if (marks.length < 2) marks = fromHeadings(blocks)
  if (marks.length < 2) marks = fromChunks(blocks)

  // Lo que quede antes del primer titulo tambien hay que poder leerlo.
  if (!marks.length || marks[0].start > 0) {
    marks.unshift({ title: 'Comienzo', start: 0 })
  }

  return marks
    .map((mark, i) => ({
      title: mark.title.trim() || `Sección ${i + 1}`,
      start: mark.start,
      end: i + 1 < marks.length ? marks[i + 1].start : blocks.length
    }))
    .filter(chapter => chapter.end > chapter.start)
}
