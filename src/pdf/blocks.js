// Lineas fisicas -> bloques de lectura (parrafos y titulos).
//
// Es la parte que decide si el libro se lee bien o se lee roto. Tres trabajos:
//   1. tirar el mobiliario de pagina (titulillos y folios repetidos)
//   2. medir el cuerpo del texto para saber que es normal en ESTE documento
//   3. reunir las lineas en parrafos y recomponer las palabras partidas
//
// Modulo puro y sin DOM: se prueba con fixtures de lineas.

import { median, percentile, mode, marginLeft } from './metrics.js'

const HEAD_ZONE = 0.11 // fraccion superior de la pagina donde vive el titulillo
const FOOT_ZONE = 0.89 // a partir de aqui, el pie

// --- Metricas del documento ------------------------------------------------

/**
 * Lo que cuenta como "normal" en este documento: cuerpo de letra, margenes e
 * interlineado. Todo lo demas se juzga contra esto.
 */
export function measureBody (lines) {
  if (!lines.length) {
    return { bodySize: 12, bodyLeft: 0, bodyRight: 0, bodyWidth: 0, leading: 14 }
  }

  const sizes = lines.map(l => l.fontSize)
  const chars = lines.map(l => l.text.length)
  const bodySize = mode(sizes, 0.5, chars) || median(sizes)

  // Solo las lineas del cuerpo definen los margenes: un titulo centrado o un
  // folio desplazado falsearia el calculo.
  const body = lines.filter(l => Math.abs(l.fontSize - bodySize) < bodySize * 0.16)
  const reference = body.length >= 4 ? body : lines

  const bodyLeft = marginLeft(reference.map(l => l.x))
  const bodyRight = percentile(reference.map(l => l.xEnd), 0.9)

  // Interlineado: distancia entre lineas consecutivas dentro de una pagina.
  const gaps = []
  for (let i = 1; i < reference.length; i++) {
    const gap = reference[i].y - reference[i - 1].y
    if (reference[i].page === reference[i - 1].page && gap > 0 && gap < bodySize * 4) gaps.push(gap)
  }

  return {
    bodySize,
    bodyLeft,
    bodyRight,
    bodyWidth: bodyRight - bodyLeft,
    leading: median(gaps) || bodySize * 1.35
  }
}

// --- Mobiliario de pagina --------------------------------------------------

/** "Capitulo 4 - 127" y "Capitulo 4 - 128" son el mismo titulillo. */
const normalize = text => text.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim()

const isFolio = text => /^[\divxlcdm]{1,7}$/i.test(text.replace(/[\s.\-–—[\]()]/g, ''))

/**
 * Un titulillo se compone en cuerpo menor o igual que el texto; un titulo de
 * capitulo, en cuerpo mayor. Sin esta distincion, un libro con capitulos
 * numerados ("Capitulo 1", "Capitulo 2"...) los pierde todos: al normalizar
 * los digitos comparten clave, aparecen en todas las paginas y se borran.
 */
const looksLikeTitle = (line, metrics) =>
  metrics ? line.fontSize >= metrics.bodySize * 1.12 : false

/**
 * Titulillos y folios: lineas en el margen que se repiten pagina tras pagina.
 * @param {Object} [metrics] medida aproximada del cuerpo, para no confundir un
 *   titulo de capitulo con un titulillo
 * @returns {Set<string>} claves "zona|texto normalizado" a descartar
 */
export function findFurniture (lines, pageHeight, pageCount, metrics = null) {
  const seen = new Map()

  for (const line of lines) {
    const zone = zoneOf(line, pageHeight)
    if (!zone) continue
    if (looksLikeTitle(line, metrics)) continue
    const key = `${zone}|${normalize(line.text)}`
    if (!seen.has(key)) seen.set(key, new Set())
    seen.get(key).add(line.page)
  }

  const threshold = Math.max(2, Math.ceil(pageCount * 0.5))
  const furniture = new Set()
  for (const [key, pages] of seen) if (pages.size >= threshold) furniture.add(key)
  return furniture
}

function zoneOf (line, pageHeight) {
  if (line.y < pageHeight * HEAD_ZONE) return 'head'
  if (line.y > pageHeight * FOOT_ZONE) return 'foot'
  return null
}

/** Aplica findFurniture y ademas tira los numeros de pagina sueltos. */
export function stripFurniture (lines, pageHeight, pageCount, metrics = null) {
  const furniture = findFurniture(lines, pageHeight, pageCount, metrics)

  return lines.filter(line => {
    // Una figura nunca es mobiliario, aunque caiga en el margen de la pagina.
    if (line.figure) return true
    const zone = zoneOf(line, pageHeight)
    if (!zone) return true
    if (looksLikeTitle(line, metrics)) return true
    if (furniture.has(`${zone}|${normalize(line.text)}`)) return false
    // Un folio no se repite nunca igual, asi que hay que reconocerlo por forma.
    return !isFolio(line.text)
  })
}

// --- Estilo de parrafo -----------------------------------------------------

// En una pagina a varias columnas cada una trae sus propios margenes; solo si
// no los hay se recurre a los del libro entero.
const leftOf = (line, metrics) => line.columnLeft ?? metrics.bodyLeft
const rightOf = (line, metrics) => line.columnRight ?? metrics.bodyRight

/**
 * Como marca este libro el inicio de parrafo. Elegir mal la senal es la causa
 * numero uno de parrafos pegados o partidos, asi que se decide por documento.
 * @returns {'indent'|'spacing'|'ragged'}
 */
export function detectParagraphStyle (lines, metrics) {
  if (lines.length < 6) return 'ragged'

  const indentThreshold = metrics.bodySize * 0.55
  const indented = lines.filter(l => l.x - leftOf(l, metrics) > indentThreshold).length
  if (indented / lines.length >= 0.08) return 'indent'

  let spaced = 0
  let transitions = 0
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].page !== lines[i - 1].page) continue
    transitions++
    if (lines[i].y - lines[i - 1].y > metrics.leading * 1.4) spaced++
  }
  if (transitions && spaced / transitions >= 0.05) return 'spacing'

  return 'ragged'
}

// --- Construccion de bloques ----------------------------------------------

function isHeading (line, metrics) {
  const bigger = line.fontSize >= metrics.bodySize * 1.12
  const short = line.width < metrics.bodyWidth * 0.8
  return bigger && short && line.text.length < 120
}

// Una sangria de primera linea mide uno o dos cuerpos de letra. Por encima de
// este techo ya no es una sangria: es otra zona de la pagina.
const MAX_INDENT_EMS = 2.5

/**
 * Si esta linea abre parrafo por sangria.
 *
 * Son dos preguntas, y antes solo se hacia la primera a medias:
 *
 *  1. El salto tiene tamano de sangria? Sin techo, una nota al margen a 220pt
 *     del cuerpo pasaba por sangrada y cada uno de sus renglones abria parrafo.
 *  2. Es un escalon? Una sangria no se repite dos renglones seguidos. Si el
 *     anterior arranca a la misma altura, no hay escalon y el parrafo sigue.
 */
function isIndentStep (line, prev, metrics) {
  const step = metrics.bodySize * 0.55
  const delta = line.x - leftOf(line, metrics)
  if (delta <= step || delta > metrics.bodySize * MAX_INDENT_EMS) return false

  // Escalon claro respecto al renglon anterior: sangria sin discusion.
  if (Math.abs(line.x - prev.x) > step) return true

  // Arranca a la misma altura que el anterior. Eso lo mismo son dos parrafos
  // cortos seguidos —los turnos de un dialogo, todos sangrados igual— que la
  // continuacion colgante de una lista. Los separa el renglon anterior: si
  // acabo corto, cerro parrafo; si llego al margen, sigue.
  return prev.xEnd < rightOf(prev, metrics) - metrics.bodySize * 1.6
}

/** Si el renglon anterior llego al margen y dejo una palabra a medias. */
const endsMidWord = (prev, metrics) =>
  /[-‐­]$/.test(prev.text) &&
  prev.xEnd >= rightOf(prev, metrics) - metrics.bodySize * 1.6

function startsParagraph (line, prev, metrics, style) {
  if (!prev) return true

  const samePage = line.page === prev.page
  const verticalGap = samePage ? line.y - prev.y : 0
  // Un hueco extra siempre separa, sea cual sea el estilo del libro.
  if (samePage && verticalGap > metrics.leading * 1.45) return true

  // Cambiar de columna siempre empieza algo nuevo.
  if (line.columnLeft !== prev.columnLeft) return true

  // Un renglon que llena la medida y ademas acaba con una palabra partida no
  // puede ser el final de un parrafo, diga lo que diga la sangria. Sin este
  // veto quedaban 830 guiones colgando solo en "Fisica Universitaria".
  if (samePage && endsMidWord(prev, metrics)) return false

  if (style === 'indent') return isIndentStep(line, prev, metrics)

  // Sin sangrias, la senal es que la linea anterior no llego al margen.
  const prevEndedShort = prev.xEnd < rightOf(prev, metrics) - metrics.bodySize * 1.6
  if (style === 'spacing') return !samePage ? prevEndedShort : false
  return prevEndedShort
}

/** Recompone el texto de un parrafo reuniendo las palabras partidas. */
export function joinLines (lines) {
  let text = ''
  for (const line of lines) {
    if (!text) { text = line.text; continue }
    const brokenWord = /[-‐­]$/.test(text)
    if (!brokenWord) {
      text += ` ${line.text}`
      continue
    }
    // Tras un guion de fin de linea nunca va espacio. Si sigue minuscula, la
    // palabra venia partida y el guion sobra; si sigue mayuscula es un
    // compuesto real (franco-Aleman) y el guion se queda.
    const wasSplit = /^[a-záéíóúüñç]/.test(line.text)
    text = wasSplit ? text.slice(0, -1) + line.text : text + line.text
  }
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * @param {Array} lines lineas ya limpias, en orden de lectura
 * @returns {Array<{type:'heading'|'paragraph', text:string, page:number}>}
 */
export function buildBlocks (lines, metrics, style) {
  const blocks = []
  let current = null

  const flush = () => {
    if (!current) return
    const text = joinLines(current.lines)
    if (text) {
      blocks.push({
        type: current.type,
        text,
        page: current.lines[0].page,
        // Donde cae el bloque en la pagina. Lo necesita la vista que resalta
        // regiones sobre el documento original en vez de re-maquetarlo.
        rects: rectsOf(current.lines)
      })
    }
    current = null
  }

  let prev = null
  for (const line of lines) {
    // Una figura es una region de lectura por si misma: ni se une al parrafo
    // anterior ni se mide como texto.
    if (line.figure) {
      flush()
      blocks.push({ type: 'figure', text: '', page: line.page, rects: [line.rect] })
      prev = null
      continue
    }

    if (isHeading(line, metrics)) {
      flush()
      current = { type: 'heading', lines: [line] }
      // Un titulo de dos lineas sigue siendo un titulo: se cierra al ver cuerpo.
      prev = line
      continue
    }

    if (current?.type === 'heading') flush()

    if (!current || startsParagraph(line, prev, metrics, style)) {
      flush()
      current = { type: 'paragraph', lines: [line] }
    } else {
      current.lines.push(line)
    }
    prev = line
  }
  flush()

  return blocks
}

/**
 * Rectangulo que ocupa el bloque en cada pagina que toca. Son varios porque un
 * parrafo puede seguir en la pagina siguiente, o pasar de una columna a otra.
 *
 * La `y` de una linea es su linea base, no su borde superior, asi que hay que
 * subir un ascendente para arriba y bajar un descendente para abajo.
 */
function rectsOf (lines) {
  const byPage = new Map()
  for (const line of lines) {
    if (!byPage.has(line.page)) byPage.set(line.page, [])
    byPage.get(line.page).push(line)
  }

  return [...byPage].map(([page, group]) => {
    const top = Math.min(...group.map(l => l.y - l.fontSize * 0.9))
    const bottom = Math.max(...group.map(l => l.y + l.fontSize * 0.3))
    const left = Math.min(...group.map(l => l.x))
    const right = Math.max(...group.map(l => l.xEnd))
    return {
      page,
      x: Math.round(left * 10) / 10,
      y: Math.round(top * 10) / 10,
      w: Math.round((right - left) * 10) / 10,
      h: Math.round((bottom - top) * 10) / 10
    }
  })
}

/**
 * Punto de entrada del modulo: paginas con lineas -> bloques de lectura.
 * @param {Array<{width:number, height:number, lines:Array}>} pages
 */
export function toBlocks (pages) {
  const pageHeight = median(pages.map(p => p.height)) || 842
  const all = pages.flatMap(p => p.lines)
  // Las figuras viajan en el mismo flujo para conservar su sitio, pero no son
  // texto y falsearian el cuerpo, los margenes y el interlineado.
  const textLines = all.filter(line => !line.figure)

  // Se mide dos veces a proposito: la primera pasada solo sirve para saber que
  // cuerpo tiene el texto y poder distinguir un titulo de un titulillo. Como el
  // cuerpo se calcula ponderando por caracteres, el mobiliario no la desvia.
  const rough = measureBody(textLines)
  const clean = stripFurniture(all, pageHeight, pages.length, rough)
  const cleanText = clean.filter(line => !line.figure)
  const metrics = measureBody(cleanText)
  const style = detectParagraphStyle(cleanText, metrics)

  return { blocks: buildBlocks(clean, metrics, style), metrics, style }
}
