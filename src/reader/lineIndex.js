// Donde esta cada linea visual del texto ya maquetado.
//
// El corte de lineas no se reimplementa: lo hace el navegador y aqui solo se
// le pregunta el resultado con Range.getClientRects(). Por eso el foco cae
// exacto y sigue siendo exacto tras cambiar la fuente, el cuerpo o el ancho.
//
// De cada linea interesan dos cosas: donde esta (para el foco) y que trozo de
// texto contiene (para anclar el progreso y las notas a caracteres, que es lo
// unico que sobrevive a un cambio de tipografia).

const SAME_LINE_PX = 2 // dos rects a menos de esto son el mismo renglon

/**
 * @typedef {Object} VisualLine
 * @property {number} top     borde superior, relativo al contenedor
 * @property {number} bottom
 * @property {number} block   indice del bloque dentro del capitulo
 * @property {number} start   offset de caracter dentro del texto del bloque
 * @property {number} end
 */

/**
 * Recorre los parrafos ya pintados y devuelve todas sus lineas visuales.
 * @param {HTMLElement} container elemento con los bloques como hijos directos
 * @returns {VisualLine[]}
 */
export function buildLineIndex (container) {
  // El origen se toma del propio contenedor, asi que su transform se cancela
  // y las medidas no dependen de por donde vaya el desplazamiento.
  const origin = container.getBoundingClientRect().top
  const range = document.createRange()
  const lines = []

  for (const el of container.children) {
    const block = Number(el.dataset.block)
    if (!Number.isInteger(block)) continue
    lines.push(...measureElement(el, block, origin, range))
  }

  return lines
}

function measureElement (el, block, origin, range) {
  const node = el.firstChild
  if (!node || node.nodeType !== Node.TEXT_NODE || node.length === 0) {
    // Un bloque sin texto (separador) sigue ocupando sitio y hay que poder
    // pasar por el, asi que cuenta como una linea.
    const box = el.getBoundingClientRect()
    return [{ top: box.top - origin, bottom: box.bottom - origin, block, start: 0, end: 0 }]
  }

  range.selectNodeContents(el)
  const rows = groupRects(range.getClientRects())
  if (!rows.length) return []

  const starts = findLineStarts(node, rows, range)

  return rows.map((row, i) => ({
    top: row.top - origin,
    bottom: row.bottom - origin,
    block,
    start: starts[i],
    end: i + 1 < starts.length ? starts[i + 1] : node.length
  }))
}

/** Varios rects a la misma altura son un unico renglon. */
function groupRects (rects) {
  const rows = []
  for (const rect of rects) {
    if (rect.width === 0 && rect.height === 0) continue
    const row = rows.find(r => Math.abs(r.top - rect.top) < SAME_LINE_PX)
    if (row) {
      row.top = Math.min(row.top, rect.top)
      row.bottom = Math.max(row.bottom, rect.bottom)
    } else {
      rows.push({ top: rect.top, bottom: rect.bottom })
    }
  }
  return rows.sort((a, b) => a.top - b.top)
}

/**
 * Primer caracter de cada renglon, por biseccion sobre el texto: log(n) por
 * linea en vez de recorrer caracter a caracter.
 */
function findLineStarts (node, rows, range) {
  const starts = [0]

  for (let i = 1; i < rows.length; i++) {
    let lo = starts[i - 1] + 1
    let hi = node.length

    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (topAt(node, mid, range) >= rows[i].top - SAME_LINE_PX) hi = mid
      else lo = mid + 1
    }

    // El espacio que provoco el corte pertenece al renglon anterior.
    while (lo < node.length && /\s/.test(node.data[lo])) lo++
    starts.push(lo)
  }

  return starts
}

function topAt (node, offset, range) {
  range.setStart(node, offset)
  range.setEnd(node, Math.min(offset + 1, node.length))
  return range.getBoundingClientRect().top
}

/** Linea que contiene un offset global de caracter, o la mas cercana. */
export function lineAtOffset (lines, blocks, globalOffset) {
  if (!lines.length) return 0

  let best = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const base = blocks[line.block]?.start ?? 0
    if (base + line.start > globalOffset) break
    best = i
  }
  return best
}

/** Offset global de caracter donde empieza una linea. */
export function offsetOfLine (lines, blocks, lineIndex) {
  const line = lines[Math.max(0, Math.min(lineIndex, lines.length - 1))]
  if (!line) return 0
  return (blocks[line.block]?.start ?? 0) + line.start
}
