// Pinta los bloques de un capitulo en las dos capas del lector.
//
// Las capas tienen que tener contenido identico, byte a byte, o el foco dejaria
// de alinearse con el texto difuminado. Se garantiza clonando: se construye una
// vez y la segunda capa recibe una copia exacta.

/**
 * @param {Object} book
 * @param {{start:number, end:number}} chapter
 * @param {{sharp:HTMLElement, dim:HTMLElement}} layers
 */
export function renderChapter (book, chapter, { sharp, dim }) {
  const fragment = document.createDocumentFragment()

  sharp.dataset.chapterKind = chapter.kind ?? 'content'
  sharp.dataset.paragraphStyle = book.stats?.paragraphStyle ?? 'space'
  dim.dataset.chapterKind = chapter.kind ?? 'content'
  dim.dataset.paragraphStyle = book.stats?.paragraphStyle ?? 'space'

  for (let i = chapter.start; i < chapter.end; i++) {
    const block = book.blocks[i]
    if (!block) continue

    if (block.type === 'figure') {
      fragment.appendChild(figureShell(block, i))
      continue
    }

    const el = document.createElement(block.type === 'heading' ? 'h2' : 'p')
    el.dataset.block = String(i)
    // textContent y nunca innerHTML: el texto viene de un archivo ajeno.
    el.textContent = block.text
    // La cubierta y el indice se presentan distinto, pero siguen siendo el
    // mismo texto y las mismas lineas: aqui no se pliega nada.
    //
    // Plegarlos como en la vista de pagina obligaria a pintar un texto que no
    // es el del bloque, y el indice de lineas hace corresponder cada renglon
    // con su tramo de caracteres: dejarian de casar, y con ellos el progreso y
    // las notas. Tampoco hace falta: la lectura ya no arranca aqui, asi que
    // estos renglones solo se ven yendo a buscarlos.
    if (block.role) el.dataset.role = block.role
    if (chapter.kind === 'frontmatter' && !block.role) el.dataset.section = 'frontmatter'
    if (block.type === 'heading' && /^[IVXLCDM]+$/u.test(block.text.trim())) {
      el.dataset.heading = 'ordinal'
    }
    fragment.appendChild(el)
  }

  const copy = fragment.cloneNode(true)
  sharp.replaceChildren(fragment)
  dim.replaceChildren(copy)
}

/**
 * El hueco de una figura, con su proporcion reservada desde el primer pintado:
 * la imagen llega despues, recortada de la pagina original, y si el alto
 * cambiara entonces se moverian todas las lineas ya medidas. El clonado de
 * capas copia el armazon; el recorte se asigna luego a las dos a la vez.
 */
function figureShell (block, index) {
  const el = document.createElement('figure')
  el.className = 'figure-clip'
  el.dataset.block = String(index)

  const rect = block.rects?.[0]
  if (rect?.w > 0 && rect?.h > 0) {
    el.style.aspectRatio = `${rect.w} / ${rect.h}`
  }

  const img = document.createElement('img')
  img.alt = ''
  img.draggable = false
  el.appendChild(img)
  return el
}

/** Capitulo al que pertenece un bloque. */
export function chapterOfBlock (book, blockIndex) {
  const index = book.chapters.findIndex(c => blockIndex >= c.start && blockIndex < c.end)
  return index === -1 ? 0 : index
}
