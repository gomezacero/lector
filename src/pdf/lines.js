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
  const figures = significantFigures(page)

  const items = page.items
    .filter(it => !it.rotated && it.text.trim() !== '')
    // Los rotulos de los ejes y las leyendas de dentro de una figura no son
    // prosa: leerlos corta el texto con fragmentos sin sentido.
    .filter(it => !insideAny(figures, it))
    .sort((a, b) => a.y - b.y || a.x - b.x)

  const rows = groupRows(items)

  // Agrupar solo por altura fusionaria la cita del margen con el cuerpo, asi
  // que antes se mira si la pagina lleva columnas.
  const channels = findChannels(rows, page.width, figures)
  if (!channels.length) {
    // Aunque no haya columnas, el margen se anota por pagina: en un libro con
    // preliminares, laminas o encartes, unas paginas empiezan mas adentro que
    // otras, y medir la sangria contra el margen del libro entero haria que en
    // esas paginas cada renglon pareciera sangrado y abriera parrafo.
    return placeFigures(
      withColumnMargins(compose(rows, pageIndex)), figures, pageIndex, channels)
  }

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

  const columns = composed.slice(0, -1)
    .map(lines => withColumnMargins(lines, true))
    .map(lines => placeFigures(lines, figures, pageIndex, channels))
    .filter(lines => lines.length)

  const wide = placeFigures(
    withColumnMargins(composed.at(-1), true), figures, pageIndex, channels, true)

  return orderGroups(columns, wide).flat()
}

/**
 * Orden de lectura entre los grupos de una pagina.
 *
 * Las columnas van de izquierda a derecha, nunca por altura: las dos empiezan
 * casi a la misma altura y cualquier diferencia de unos puntos —una figura que
 * asoma antes, por ejemplo— invertiria el orden de lectura entero.
 *
 * El texto que corre a todo lo ancho es el unico que se coloca por altura: si
 * empieza antes que las columnas es un titulo y va delante; si empieza despues
 * es texto que continua por debajo y va detras.
 */
function orderGroups (columns, wide) {
  if (!wide.length) return columns
  if (!columns.length) return [wide]

  const firstColumnY = Math.min(...columns.map(group => group[0].y))
  return wide[0].y < firstColumnY ? [wide, ...columns] : [...columns, wide]
}

/**
 * Figuras que merecen ser una region propia.
 *
 * Hay que hilar fino porque el texto que cae dentro de una figura se descarta:
 * confundir con una figura el fondo de la pagina, un marco o el sombreado de un
 * cuadro se lleva por delante capitulos enteros. La regla que lo separa es que
 * una figura lleva rotulos sueltos, nunca parrafos: si dentro hay mucho texto,
 * no es una figura por grande que sea el trazo.
 */
function significantFigures (page) {
  const minArea = page.width * page.height * 0.006
  const maxArea = page.width * page.height * 0.6
  const texts = page.items.filter(it => !it.rotated && it.text.trim() !== '')

  return (page.drawings ?? [])
    .filter(d => d.w > 28 && d.h > 14 && d.w * d.h >= minArea && d.w * d.h <= maxArea)
    // Una imagen ya es una figura; un dibujo tiene que traer varios trazos. Un
    // recuadro suelto o el filete de un titulillo son un trazo y no pintan nada.
    .filter(d => d.image || (d.parts ?? 1) >= 4)
    .filter(d => {
      // Los rotulos de unos ejes suman unos pocos caracteres. Si ahi dentro hay
      // parrafos, lo que se ha encontrado no es una figura sino un recuadro que
      // enmarca texto, y descartarlo se llevaria la pagina por delante.
      const chars = texts
        .filter(it => insideAny([d], it))
        .reduce((total, it) => total + it.text.trim().length, 0)
      return chars <= MAX_LABEL_CHARS
    })
}

const MAX_LABEL_CHARS = 150

const insideAny = (figures, item) => figures.some(f => {
  const cx = item.x + item.w / 2
  const cy = item.y - item.h * 0.3
  return cx >= f.x && cx <= f.x + f.w && cy >= f.y && cy <= f.y + f.h
})

/**
 * Mete cada figura en el sitio que le toca dentro del recorrido de lectura:
 * en su columna y a su altura, para que el foco pase por ella al llegar.
 */
function placeFigures (lines, figures, pageIndex, channels, isWide = false) {
  if (!figures.length || !lines.length) return lines

  // Una figura que cruza un canal pertenece al flujo ancho, no a una columna.
  const crossesChannel = f => channels.some(c => f.x < c && f.x + f.w > c)
  const mine = figures.filter(f => isWide
    ? crossesChannel(f)
    : !crossesChannel(f) && columnIndexOf(f, channels) === columnIndexOf(lines[0], channels))
  if (!mine.length) return lines

  const asLines = mine.map(f => ({
    figure: true,
    text: '',
    x: f.x,
    xEnd: f.x + f.w,
    width: f.w,
    y: f.y,
    fontSize: 0,
    font: '',
    page: pageIndex,
    rect: { page: pageIndex, x: f.x, y: f.y, w: f.w, h: f.h },
    columnLeft: lines[0].columnLeft,
    columnRight: lines[0].columnRight
  }))

  return [...lines, ...asLines].sort((a, b) => a.y - b.y)
}

function columnIndexOf (box, channels) {
  if (!box) return 0
  const center = box.x + (box.width ?? box.w ?? 0) / 2
  let index = 0
  while (index < channels.length && center > channels[index]) index++
  return index
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
function withColumnMargins (lines, columned = false) {
  if (!lines.length) return lines

  // Margen predominante, no el minimo: la ultima linea de un parrafo del texto
  // ancho es corta, no llega a cruzar el canal y cae en este grupo. Si se
  // quedara con el margen, todas las demas pareceran sangradas.
  const left = marginLeft(lines.map(l => l.x))
  const right = percentile(lines.map(l => l.xEnd), 0.9)
  for (const line of lines) {
    line.columnLeft = left
    line.columnRight = right
    // Marca aparte del margen: el margen se anota siempre, pero solo estas
    // paginas van de verdad a varias columnas, y es lo que decide la vista.
    if (columned) line.columned = true
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
