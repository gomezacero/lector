// Items sueltos -> lineas fisicas.
//
// pdf.js entrega fragmentos con coordenadas, sin ninguna nocion de linea: un
// mismo renglon puede llegar partido en cinco items porque cambia la fuente o
// porque el maquetador ajusto el espaciado. Aqui se vuelven a juntar.
//
// Modulo puro: entra el resultado de extractPage(), sale una lista de lineas.

import { findChannels, splitRow, rowsInColumnMode } from './columns.js'
import { marginLeft, percentile } from './metrics.js'

/** Dos items estan en el mismo renglon si sus lineas base casi coinciden. */
function sameLine (a, b) {
  const tolerance = Math.max(a.h, b.h) * 0.45
  return Math.abs(a.y - b.y) <= tolerance
}

/**
 * @param {{width:number, height:number, items:Array}} page
 * @param {number} pageIndex indice 0-based, se copia a cada linea
 * @returns {Array} lineas en orden de lectura
 */
export function buildLines (page, pageIndex = 0) {
  const items = page.items
    .filter(it => !it.rotated && it.text.trim() !== '')
    .sort((a, b) => a.y - b.y || a.x - b.x)

  const rows = groupRows(items)

  // Agrupar solo por altura fusionaria la cita del margen con el cuerpo, asi
  // que antes se mira si la pagina lleva columnas.
  const channels = findChannels(rows, page.width)
  if (!channels.length) return compose(rows, pageIndex)

  // Cada columna se lee entera antes de pasar a la siguiente, y el texto que
  // corre a todo lo ancho forma un flujo aparte con su propio margen.
  const columnMode = rowsInColumnMode(rows, channels)
  const groups = Array.from({ length: channels.length + 2 }, () => [])

  rows.forEach((row, index) => {
    // Fuera de la franja de columnas el renglon se queda entero: ahi el canal
    // no separa nada, solo coincide con algun espacio.
    if (!columnMode[index]) {
      groups.at(-1).push(row)
      return
    }
    const { columns, wide } = splitRow(row, channels)
    columns.forEach((part, i) => { if (part.length) groups[i].push(part) })
    if (wide.length) groups.at(-1).push(wide)
  })

  const composed = groups.map(rowsOfGroup => compose(rowsOfGroup, pageIndex))
  reclaimWideLines(composed)

  return composed
    .map(withColumnMargins)
    .filter(lines => lines.length)
    // Los grupos se leen en el orden en que empiezan en la pagina: las columnas
    // primero y despues el texto ancho que suele venir por debajo.
    .sort((a, b) => a[0].y - b[0].y)
    .flat()
}

/**
 * Devuelve al flujo ancho las lineas que se le habian escapado.
 *
 * La ultima linea de un parrafo es corta y puede no llegar a cruzar el canal,
 * asi que cae en la columna de la izquierda y aparece descolocada, lejos del
 * parrafo al que pertenece. Se reconocen porque arrancan en el margen del texto
 * ancho y no en el de la columna.
 */
function reclaimWideLines (groups) {
  const wide = groups.at(-1)
  const first = groups[0]
  if (wide.length < 2 || !first.length) return

  const wideMargin = marginLeft(wide.map(l => l.x))
  const columnMargin = marginLeft(first.map(l => l.x))
  if (Math.abs(wideMargin - columnMargin) < 4) return

  for (let i = first.length - 1; i >= 0; i--) {
    if (Math.abs(first[i].x - wideMargin) <= 3) wide.push(...first.splice(i, 1))
  }
  wide.sort((a, b) => a.y - b.y)
}

/**
 * Cada grupo trae sus propios margenes. Sin esto, medir la sangria contra el
 * margen del libro haria que la columna de la derecha pareciera sangrada entera
 * y cada renglon abriria parrafo.
 */
function withColumnMargins (lines) {
  if (!lines.length) return lines

  // Margen predominante, no el minimo: la ultima linea de un parrafo del texto
  // ancho es corta, no llega a cruzar el canal y cae en este grupo. Si se
  // quedara con el margen, todas las demas pareceran sangradas.
  const left = marginLeft(lines.map(l => l.x))
  const right = percentile(lines.map(l => l.xEnd), 0.9)
  for (const line of lines) {
    line.columnLeft = left
    line.columnRight = right
  }
  return lines
}

/** Agrupa los fragmentos en renglones por su altura, cada uno ordenado por x. */
function groupRows (items) {
  const rows = []
  for (const item of items) {
    const row = rows.find(r => sameLine(r[0], item))
    if (row) row.push(item)
    else rows.push([item])
  }
  return rows.map(row => [...row].sort((a, b) => a.x - b.x))
}

const compose = (rows, pageIndex) => rows
  .map(row => composeLine(row, pageIndex))
  .filter(line => line.text !== '')
  .sort((a, b) => a.y - b.y)

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
