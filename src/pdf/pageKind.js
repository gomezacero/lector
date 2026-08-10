// Que clase de pagina es cada una: con texto, escaneada, mixta, vacia o
// sospechosa de extraccion rota.
//
// La clasificacion decide cosas de peso: si un libro entra como escaneado en
// vez de rechazarse, si conviene la vista de pagina, y sobre que paginas
// correria un OCR. Por eso las reglas viven aqui solas, puras, con sus
// contraejemplos anotados, y no repartidas por el lector.

// Cuanta pagina tiene que cubrir la imagen para pensar en un escaneo. No se
// pide el 100% porque los escaneres dejan margenes y algunos parten la pagina
// en tiras horizontales, cada una un XObject.
const SCAN_IMAGE_SHARE = 0.6

// Con menos caracteres que esto, el texto que acompana a la imagen no es la
// pagina: es un folio estampado o el sello de la biblioteca.
const SCAN_MAX_CHARS = 40

// Una pagina con una foto grande y un pie de unas lineas es mixta; si el
// texto pasa de aqui, la imagen es un fondo o una lamina dentro de una pagina
// que se lee entera. El contraejemplo que fija este umbral es el escaneado
// con capa OCR previa: imagen a pagina completa y el texto integro debajo.
// Ese se lee con su texto nativo, no se vuelve a reconocer.
const MIXED_MAX_CHARS = 400

// Debajo de esto la pagina esta en blanco a efectos de lectura: como mucho
// lleva el numero de pagina o un adorno. Solo la imagen que domina la pagina
// la salva de ser "vacia", y esa ya se clasifico antes como escaneo.
const EMPTY_MAX_CHARS = 5

// Proporcion de U+FFFD (el caracter de sustitucion) que delata una fuente sin
// correspondencia Unicode fiable. Deliberadamente conservador: un falso
// "sospechosa" molesta mas de lo que ayuda.
const SUSPECT_BAD_SHARE = 0.05

/**
 * @param {{width:number, height:number, items?:Array, images?:Array}} page
 *   una pagina tal y como la devuelve extractPage, con las cajas de imagen
 *   crudas (sin el filtro del 85% de mergeDrawings, que se come justo la
 *   imagen del escaneo)
 * @returns {{kind:'text'|'scanned'|'mixed'|'empty'|'suspect', charCount:number, imageShare:number}}
 */
export function classifyPage ({ width, height, items = [], images = [] }) {
  // El texto girado no cuenta: una marca de agua diagonal sobre un escaneo
  // no convierte la pagina en legible.
  let charCount = 0
  let badChars = 0
  for (const item of items) {
    if (item.rotated) continue
    charCount += countInk(item.text)
    badChars += count(item.text, '�')
  }

  // Suma de areas recortadas a la pagina. Se suman en vez de quedarse con la
  // mayor por las tiras de escaner; puede contar doble si se solapan, pero
  // para un umbral del 60% la distincion no cambia el veredicto.
  const pageArea = width * height
  let imageArea = 0
  for (const image of images) {
    imageArea += clippedArea(image, width, height)
  }
  const imageShare = pageArea > 0 ? Math.min(1, imageArea / pageArea) : 0

  return { kind: kindOf(charCount, badChars, imageShare), charCount, imageShare }
}

function kindOf (charCount, badChars, imageShare) {
  if (imageShare >= SCAN_IMAGE_SHARE && charCount < SCAN_MAX_CHARS) return 'scanned'
  if (charCount <= EMPTY_MAX_CHARS) return 'empty'
  if (badChars / Math.max(1, charCount) >= SUSPECT_BAD_SHARE) return 'suspect'
  if (imageShare >= SCAN_IMAGE_SHARE && charCount < MIXED_MAX_CHARS) return 'mixed'
  return 'text'
}

/** Caracteres con tinta: los espacios no dicen nada de si hay algo que leer. */
function countInk (text) {
  let n = 0
  for (const ch of text) if (!/\s/.test(ch)) n++
  return n
}

function count (text, target) {
  let n = 0
  for (const ch of text) if (ch === target) n++
  return n
}

function clippedArea (box, width, height) {
  const left = Math.max(0, box.x)
  const top = Math.max(0, box.y)
  const right = Math.min(width, box.x + box.w)
  const bottom = Math.min(height, box.y + box.h)
  return Math.max(0, right - left) * Math.max(0, bottom - top)
}
