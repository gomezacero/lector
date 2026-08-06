// Pinta los bloques de un capitulo en las dos capas del lector.
//
// Las capas tienen que tener contenido identico, byte a byte, o el foco dejaria
// de alinearse con el texto difuminado. Se garantiza clonando: se construye una
// vez y la segunda capa recibe una copia exacta.

/**
 * @param {Object} book
 * @param {{start:number, end:number}} chapter
 * @param {{sharp:HTMLElement, dim:HTMLElement}} layers
 * @param {Set<number>} markedBlocks bloques con marcador, para la barra al margen
 */
export function renderChapter (book, chapter, { sharp, dim }, markedBlocks = new Set()) {
  const fragment = document.createDocumentFragment()

  for (let i = chapter.start; i < chapter.end; i++) {
    const block = book.blocks[i]
    if (!block) continue

    const el = document.createElement(block.type === 'heading' ? 'h2' : 'p')
    el.dataset.block = String(i)
    // textContent y nunca innerHTML: el texto viene de un archivo ajeno.
    el.textContent = block.text
    if (markedBlocks.has(i)) el.dataset.marked = ''
    fragment.appendChild(el)
  }

  const copy = fragment.cloneNode(true)
  sharp.replaceChildren(fragment)
  dim.replaceChildren(copy)
}

/** Refleja en el DOM que un bloque tiene o deja de tener marcador. */
export function setBlockMarked (layers, blockIndex, marked) {
  for (const layer of [layers.sharp, layers.dim]) {
    const el = layer.querySelector(`[data-block="${blockIndex}"]`)
    if (!el) continue
    if (marked) el.dataset.marked = ''
    else delete el.dataset.marked
  }
}

/** Capitulo al que pertenece un bloque. */
export function chapterOfBlock (book, blockIndex) {
  const index = book.chapters.findIndex(c => blockIndex >= c.start && blockIndex < c.end)
  return index === -1 ? 0 : index
}
