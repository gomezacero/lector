// Geometria del modelo de layout: del lienzo al modelo y de vuelta a puntos
// de PDF. Modulo puro, sin ONNX ni DOM, para poder probarlo en vitest.
//
// El modelo (YOLOv10 entrenado en DocLayNet) espera un cuadrado de 640x640:
// la pagina se escala por su lado mayor y se rellena el resto. El anclado es
// arriba a la izquierda —sin centrar— para que volver a coordenadas de pagina
// sea una sola division.

export const INPUT_SIZE = 640

// Las once clases de DocLayNet, en el orden del modelo.
export const LABELS = [
  'caption', 'footnote', 'formula', 'list-item', 'page-footer', 'page-header',
  'picture', 'section-header', 'table', 'text', 'title'
]

/**
 * Como encaja una pagina en el cuadrado del modelo.
 * @param {number} width alto y ancho del lienzo de la pagina, en pixeles
 * @returns {{scale:number, w:number, h:number}} escala y tamano ya escalado
 */
export function fitBox (width, height, input = INPUT_SIZE) {
  const scale = input / Math.max(width, height)
  return { scale, w: Math.round(width * scale), h: Math.round(height * scale) }
}

/**
 * De la salida del modelo a detecciones en puntos de PDF.
 *
 * YOLOv10 no necesita supresion de solapados: entrega directamente hasta 300
 * filas (x1, y1, x2, y2, confianza, clase) en coordenadas del cuadrado.
 *
 * @param {Float32Array|number[]} output filas planas de 6 valores
 * @param {{scale:number}} fit el encaje que uso el preprocesado
 * @param {number} renderScale pixeles del lienzo por punto de PDF
 * @param {number} [minScore]
 * @returns {Array<{label:string, score:number, x:number, y:number, w:number, h:number}>}
 */
export function decodeDetections (output, fit, renderScale, minScore = 0.3) {
  const detections = []
  const toPdf = value => value / fit.scale / renderScale

  for (let at = 0; at + 5 < output.length; at += 6) {
    const score = output[at + 4]
    if (score < minScore) continue

    const label = LABELS[Math.round(output[at + 5])]
    if (!label) continue

    const x = toPdf(output[at])
    const y = toPdf(output[at + 1])
    detections.push({
      label,
      score: Math.round(score * 100) / 100,
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10,
      w: Math.round((toPdf(output[at + 2]) - x) * 10) / 10,
      h: Math.round((toPdf(output[at + 3]) - y) * 10) / 10
    })
  }

  // De arriba a abajo, que es como se leen; el desempate por la izquierda.
  return detections.sort((a, b) => a.y - b.y || a.x - b.x)
}
