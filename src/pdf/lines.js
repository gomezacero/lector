// Items sueltos -> lineas fisicas.
//
// pdf.js entrega fragmentos con coordenadas, sin ninguna nocion de linea: un
// mismo renglon puede llegar partido en cinco items porque cambia la fuente o
// porque el maquetador ajusto el espaciado. Aqui se vuelven a juntar.
//
// Modulo puro: entra el resultado de extractPage(), sale una lista de lineas.

/** Dos items estan en el mismo renglon si sus lineas base casi coinciden. */
function sameLine (a, b) {
  const tolerance = Math.max(a.h, b.h) * 0.45
  return Math.abs(a.y - b.y) <= tolerance
}

/**
 * @param {{width:number, height:number, items:Array}} page
 * @param {number} pageIndex indice 0-based, se copia a cada linea
 * @returns {Array} lineas ordenadas de arriba abajo
 */
export function buildLines (page, pageIndex = 0) {
  const items = page.items
    .filter(it => !it.rotated && it.text.trim() !== '')
    .sort((a, b) => a.y - b.y || a.x - b.x)

  const groups = []
  for (const item of items) {
    const group = groups.find(g => sameLine(g[0], item))
    if (group) group.push(item)
    else groups.push([item])
  }

  return groups
    .map(group => composeLine(group, pageIndex))
    .filter(line => line.text !== '')
    .sort((a, b) => a.y - b.y)
}

function composeLine (group, pageIndex) {
  const parts = [...group].sort((a, b) => a.x - b.x)

  let text = ''
  let prev = null
  for (const item of parts) {
    if (prev) {
      const gap = item.x - (prev.x + prev.w)
      // Un espacio ronda 0.25em, asi que por encima de 0.28em casi seguro lo es.
      // Por debajo es kerning o el ajuste de un renglon justificado, y meter un
      // espacio ahi parte palabras: mas vale quedarse corto.
      const needsSpace = gap > Math.max(prev.h, item.h) * 0.28
      if (needsSpace && !/\s$/.test(text) && !/^\s/.test(item.text)) text += ' '
    }
    text += item.text
    prev = item
  }

  const heights = parts.map(p => p.h).filter(h => h > 0).sort((a, b) => a - b)
  const xEnd = Math.max(...parts.map(p => p.x + p.w))

  return {
    text: text.replace(/\s+/g, ' ').trim(),
    x: parts[0].x,
    xEnd,
    width: xEnd - parts[0].x,
    y: Math.min(...parts.map(p => p.y)),
    // La mediana ignora la mayuscula capitular o el volado que falsearia la media.
    fontSize: heights.length ? heights[Math.floor(heights.length / 2)] : 0,
    // La fuente dominante es la que cubre mas texto, no la del primer fragmento.
    font: dominantFont(parts),
    page: pageIndex
  }
}

function dominantFont (parts) {
  const weight = new Map()
  for (const p of parts) weight.set(p.font, (weight.get(p.font) ?? 0) + p.text.length)
  let best = ''
  let max = -1
  for (const [font, chars] of weight) if (chars > max) { max = chars; best = font }
  return best
}
