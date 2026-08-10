// Pinta los resaltados del capitulo visible sin tocar el DOM.
//
// La CSS Custom Highlight API colorea rangos de texto directamente: los
// parrafos siguen siendo UN nodo de texto, que es la invariante de la que
// depende la medida de lineas (lineIndex bisecciona sobre el primer nodo).
// Envolver los tramos en <mark> la romperia.
//
// Los rangos mueren cuando el capitulo se repinta (replaceChildren), asi que
// esto se vuelve a llamar tras cada renderChapter y cada cambio de notas.

export const HIGHLIGHT_COLORS = ['yellow', 'green', 'blue']

/**
 * @param {{sharp:HTMLElement, dim:HTMLElement}} layers
 * @param {Array} blocks del libro
 * @param {{start:number, end:number}} chapter bloques visibles
 * @param {Array} notes todas las notas; solo cuentan las kind 'highlight'
 */
export function paintHighlights (layers, blocks, chapter, notes) {
  if (!('highlights' in CSS)) return

  const byColor = new Map(HIGHLIGHT_COLORS.map(color => [color, []]))

  for (const note of notes) {
    if (note.kind !== 'highlight' || note.end == null) continue
    const ranges = byColor.get(note.color) ?? byColor.get('yellow')

    // Un resaltado puede cruzar bloques: cada bloque recibe su tramo.
    for (let i = chapter.start; i < chapter.end; i++) {
      const block = blocks[i]
      if (!block) continue
      const from = Math.max(note.offset, block.start) - block.start
      const to = Math.min(note.end, block.start + block.text.length) - block.start
      if (to <= from) continue

      for (const layer of [layers.sharp, layers.dim]) {
        const node = layer.querySelector(`[data-block="${i}"]`)?.firstChild
        if (!node || node.nodeType !== Node.TEXT_NODE) continue
        const range = new Range()
        range.setStart(node, Math.min(from, node.length))
        range.setEnd(node, Math.min(to, node.length))
        ranges.push(range)
      }
    }
  }

  for (const [color, ranges] of byColor) {
    if (ranges.length) CSS.highlights.set(`lector-${color}`, new Highlight(...ranges))
    else CSS.highlights.delete(`lector-${color}`)
  }
}

/** Al cerrar el libro no debe quedar nada pintado. */
export function clearHighlights () {
  if (!('highlights' in CSS)) return
  for (const color of HIGHLIGHT_COLORS) CSS.highlights.delete(`lector-${color}`)
}
