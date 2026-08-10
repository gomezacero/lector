// Del resultado de Tesseract a items de texto del pipeline.
//
// El contrato de salida es el mismo que el de extractPage: items con texto,
// coordenadas en puntos de PDF con origen arriba a la izquierda, y la 'y' en
// la LINEA BASE, no en el borde superior (blocks.js sube 0.9 cuerpos desde
// ahi para dibujar los rectangulos). Cumpliendolo, toda la cadena
// buildLines -> toBlocks -> capitulos funciona sobre un escaneado sin
// cambiar una linea: espacios, parrafos, sangrias y mobiliario salen gratis.
//
// Se emite UN item por linea de Tesseract, no uno por palabra. Tesseract ya
// decidio donde hay espacio entre palabras mirando los glifos, que es mejor
// informacion que la heuristica de huecos de composeLine; un item por palabra
// la obligaria a redescubrir cada espacio, con el cuerpo estimado ademas al
// alza, y las palabras saldrian pegadas.

// Una palabra por debajo de esta confianza es casi siempre una mancha del
// escaneo, una mota o un resto de tinta leidos como letras.
const MIN_WORD_CONFIDENCE = 35

// La caja de una linea incluye ascendentes y descendentes: mide en torno a
// 1.3 cuerpos. El cuerpo aparente que esperan lines.js y blocks.js es la
// letra, no la caja.
const BODY_OF_BOX = 0.75

/**
 * @param {Array} blocks los bloques de data.blocks de Tesseract
 * @param {{scale:number, minWordConfidence?:number}} options escala a la que
 *   se rasterizo la pagina (pixeles por punto de PDF)
 * @returns {{items:Array, confidence:number}} confidence en 0..1, ponderada
 *   por caracteres
 */
export function toItems (blocks, { scale, minWordConfidence = MIN_WORD_CONFIDENCE }) {
  const items = []
  let weighted = 0
  let chars = 0

  for (const block of blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        const words = (line.words ?? []).filter(w =>
          w.confidence >= minWordConfidence && w.text.trim().length)
        if (!words.length) continue

        const text = words.map(w => w.text).join(' ')
        const x0 = words[0].bbox.x0
        const x1 = words[words.length - 1].bbox.x1
        const boxH = line.bbox.y1 - line.bbox.y0

        items.push({
          text,
          x: x0 / scale,
          y: baselineOf(line) / scale,
          w: (x1 - x0) / scale,
          h: (boxH * BODY_OF_BOX) / scale,
          font: 'ocr',
          eol: true,
          rotated: false,
          scaleX: 1
        })

        for (const word of words) {
          weighted += word.confidence * word.text.length
          chars += word.text.length
        }
      }
    }
  }

  return {
    items,
    confidence: chars ? Math.round(weighted / chars) / 100 : 0
  }
}

/** La linea base que declara Tesseract; si no llega, se estima desde la caja.
 *  Los descendentes cuelgan por debajo de la base mas o menos un 15%. */
function baselineOf (line) {
  const base = line.baseline
  if (base && Number.isFinite(base.y0) && Number.isFinite(base.y1)) {
    return (base.y0 + base.y1) / 2
  }
  return line.bbox.y1 - 0.15 * (line.bbox.y1 - line.bbox.y0)
}
