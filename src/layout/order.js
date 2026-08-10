// Orden de lectura sobre las cajas del modelo de layout.
//
// El modelo entrega cajas sueltas, sin decir cuales van antes. Aqui se
// ordenan como las recorre un lector: corte recursivo por valles de blanco
// (XY-cut), primero horizontal —lo de arriba antes que lo de abajo— y dentro
// de cada franja vertical —la columna izquierda antes que la derecha. Un
// titulo a todo lo ancho parte la pagina en "antes" y "despues", y el
// recuadro lateral de metas queda entero, detras de la columna principal de
// su franja.
//
// Ademas se limpia lo que no es una parada de lectura: titulillos y folios
// (page-header, page-footer) fuera, y cada pie de figura pegado a su figura,
// que se miran juntos.
//
// Modulo puro: se prueba con las detecciones reales capturadas por la tarea
// `layout`.

// Valle minimo, en puntos de PDF: por debajo de esto dos cajas casi se tocan
// y separar por ahi seria cortar por ruido de deteccion.
const MIN_GAP = 6

// Un pie se une a su figura o tabla si esta a menos de esto en vertical.
const CAPTION_REACH = 24

const FURNITURE = new Set(['page-header', 'page-footer'])

// Solapamiento a partir del cual dos cajas son la misma cosa vista dos veces.
// El modelo emite duplicados de vez en cuando: en la portadilla de "Fisica
// Universitaria" el rotulo de las metas sale como tres section-header casi
// identicos al 30, 40 y 74%.
const DUP_IOU = 0.7
const DUP_CONTAINMENT = 0.85

/**
 * @param {Array<{label:string, score:number, x:number, y:number, w:number, h:number}>} boxes
 * @returns {Array} las mismas cajas, limpias, con los pies fundidos y en
 *   orden de lectura
 */
export function orderBoxes (boxes) {
  const kept = dedupe(boxes.filter(b => !FURNITURE.has(b.label)))
  return cut(attachCaptions(kept))
}

/**
 * Se queda con la caja de mas confianza de cada grupo de duplicados. La
 * contencion solo cuenta entre cajas de la misma clase: una formula DENTRO de
 * un parrafo son dos cosas de verdad, no un duplicado.
 */
function dedupe (boxes) {
  const sorted = [...boxes].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
  const kept = []
  for (const box of sorted) {
    const duplicated = kept.some(k =>
      iou(k, box) >= DUP_IOU ||
      (k.label === box.label && containment(k, box) >= DUP_CONTAINMENT))
    if (!duplicated) kept.push(box)
  }
  return kept
}

function intersection (a, b) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return Math.max(0, w) * Math.max(0, h)
}

function iou (a, b) {
  const inter = intersection(a, b)
  return inter / (a.w * a.h + b.w * b.h - inter || 1)
}

/** Cuanta de la caja menor cae dentro de la interseccion. */
function containment (a, b) {
  return intersection(a, b) / (Math.min(a.w * a.h, b.w * b.h) || 1)
}

/**
 * Cada pie, dentro de la caja de su figura o tabla: son una unidad de
 * lectura, y sueltos el orden los puede dejar en la otra punta de la pagina.
 */
function attachCaptions (boxes) {
  const captions = boxes.filter(b => b.label === 'caption')
  if (!captions.length) return boxes

  const rest = boxes.filter(b => b.label !== 'caption')
  for (const caption of captions) {
    const host = rest
      .filter(b => (b.label === 'picture' || b.label === 'table') &&
        overlapX(caption, b) > 0 && verticalGap(caption, b) <= CAPTION_REACH)
      .sort((a, b) => verticalGap(caption, a) - verticalGap(caption, b))[0]

    if (host) union(host, caption)
    else rest.push(caption) // un pie sin figura cerca se lee como texto
  }
  return rest
}

function cut (boxes) {
  if (boxes.length <= 1) return boxes

  // Primero a lo alto: lo que esta claramente encima se lee antes, incluidas
  // las cabeceras a todo lo ancho que parten la pagina en dos.
  const bands = split(boxes, 'y', 'h')
  if (bands) return bands.flatMap(cut)

  // Dentro de una franja, columnas: la izquierda entera antes que la derecha.
  const columns = split(boxes, 'x', 'w')
  if (columns) return columns.flatMap(cutBand)

  return sortLoose(boxes)
}

/** Dentro de una columna ya solo se corta a lo alto; sin esto, dos columnas
 *  anidadas hasta el infinito podrian alternarse sin avanzar. */
function cutBand (boxes) {
  if (boxes.length <= 1) return boxes
  const bands = split(boxes, 'y', 'h')
  if (bands) return bands.flatMap(cutBand)
  return sortLoose(boxes)
}

/**
 * Parte un grupo de cajas por los valles del eje dado: tramos sin ninguna
 * caja que los cruce. Devuelve null si no hay valle.
 */
function split (boxes, at, size) {
  const spans = boxes
    .map(b => [b[at], b[at] + b[size]])
    .sort((a, b) => a[0] - b[0])

  // Fusiona los tramos cubiertos y localiza los huecos entre ellos.
  const groups = []
  let end = -Infinity
  for (const [from, to] of spans) {
    if (from - end >= MIN_GAP && end !== -Infinity) groups.push(end)
    end = Math.max(end, to)
  }
  if (!groups.length) return null

  const parts = Array.from({ length: groups.length + 1 }, () => [])
  for (const box of boxes) {
    const index = groups.filter(cutAt => box[at] >= cutAt).length
    parts[index].push(box)
  }
  return parts
}

/** Sin valles que ayuden: de arriba a abajo y de izquierda a derecha. */
const sortLoose = boxes => boxes.sort((a, b) => a.y - b.y || a.x - b.x)

const overlapX = (a, b) =>
  Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)

const verticalGap = (a, b) =>
  Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h))

/** Ensancha `host` hasta cubrir tambien a `extra`. Muta a proposito. */
function union (host, extra) {
  const right = Math.max(host.x + host.w, extra.x + extra.w)
  const bottom = Math.max(host.y + host.h, extra.y + extra.h)
  host.x = Math.min(host.x, extra.x)
  host.y = Math.min(host.y, extra.y)
  host.w = right - host.x
  host.h = bottom - host.y
}
