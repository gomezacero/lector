// Lineas fisicas -> bloques de lectura (parrafos y titulos).
//
// Es la parte que decide si el libro se lee bien o se lee roto. Tres trabajos:
//   1. tirar el mobiliario de pagina (titulillos y folios repetidos)
//   2. medir el cuerpo del texto para saber que es normal en ESTE documento
//   3. reunir las lineas en parrafos y recomponer las palabras partidas
//
// Modulo puro y sin DOM: se prueba con fixtures de lineas.

const HEAD_ZONE = 0.11 // fraccion superior de la pagina donde vive el titulillo
const FOOT_ZONE = 0.89 // a partir de aqui, el pie

// --- Metricas del documento ------------------------------------------------

function median (values) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function percentile (values, p) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]
}

/**
 * Margen izquierdo del cuerpo. No vale la moda: en un libro de parrafos cortos
 * hay tantas lineas sangradas como sin sangrar y el empate elige la sangria,
 * que es justo la senal que luego hay que detectar. El margen es el menor de
 * los valores con presencia real.
 */
function marginLeft (values, bucket = 2, minShare = 0.12) {
  const tally = new Map()
  for (const value of values) {
    const key = Math.round(value / bucket) * bucket
    tally.set(key, (tally.get(key) ?? 0) + 1)
  }

  const floor = values.length * minShare
  const frequent = [...tally].filter(([, count]) => count >= floor).map(([key]) => key)
  return frequent.length ? Math.min(...frequent) : percentile(values, 0.1)
}

/** Valor mas frecuente, agrupando en cubos para tolerar el ruido decimal. */
function mode (values, bucket = 1, weights = null) {
  const tally = new Map()
  values.forEach((value, i) => {
    const key = Math.round(value / bucket) * bucket
    tally.set(key, (tally.get(key) ?? 0) + (weights ? weights[i] : 1))
  })
  let best = 0
  let max = -1
  for (const [key, count] of tally) if (count > max) { max = count; best = key }
  return best
}

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
    const zone = zoneOf(line, pageHeight)
    if (!zone) return true
    if (looksLikeTitle(line, metrics)) return true
    if (furniture.has(`${zone}|${normalize(line.text)}`)) return false
    // Un folio no se repite nunca igual, asi que hay que reconocerlo por forma.
    return !isFolio(line.text)
  })
}

// --- Estilo de parrafo -----------------------------------------------------

/**
 * Como marca este libro el inicio de parrafo. Elegir mal la senal es la causa
 * numero uno de parrafos pegados o partidos, asi que se decide por documento.
 * @returns {'indent'|'spacing'|'ragged'}
 */
export function detectParagraphStyle (lines, metrics) {
  if (lines.length < 6) return 'ragged'

  const indentThreshold = metrics.bodySize * 0.55
  const indented = lines.filter(l => l.x - metrics.bodyLeft > indentThreshold).length
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

function startsParagraph (line, prev, metrics, style) {
  if (!prev) return true

  const samePage = line.page === prev.page
  const verticalGap = samePage ? line.y - prev.y : 0
  // Un hueco extra siempre separa, sea cual sea el estilo del libro.
  if (samePage && verticalGap > metrics.leading * 1.45) return true

  const indented = line.x - metrics.bodyLeft > metrics.bodySize * 0.55
  if (style === 'indent') return indented

  // Sin sangrias, la senal es que la linea anterior no llego al margen.
  const prevEndedShort = prev.xEnd < metrics.bodyRight - metrics.bodySize * 1.6
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
    if (text) blocks.push({ type: current.type, text, page: current.lines[0].page })
    current = null
  }

  let prev = null
  for (const line of lines) {
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
 * Punto de entrada del modulo: paginas con lineas -> bloques de lectura.
 * @param {Array<{width:number, height:number, lines:Array}>} pages
 */
export function toBlocks (pages) {
  const pageHeight = median(pages.map(p => p.height)) || 842
  const all = pages.flatMap(p => p.lines)

  // Se mide dos veces a proposito: la primera pasada solo sirve para saber que
  // cuerpo tiene el texto y poder distinguir un titulo de un titulillo. Como el
  // cuerpo se calcula ponderando por caracteres, el mobiliario no la desvia.
  const rough = measureBody(all)
  const clean = stripFurniture(all, pageHeight, pages.length, rough)
  const metrics = measureBody(clean)
  const style = detectParagraphStyle(clean, metrics)

  return { blocks: buildBlocks(clean, metrics, style), metrics, style }
}
