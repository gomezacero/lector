// El modelo de layout local: detecta que hay en una pagina renderizada.
//
// Mismo patron que el OCR: todo dentro del paquete y sin tocar la red. El
// motor es onnxruntime-web (WASM) y el modelo un YOLOv10 entrenado en
// DocLayNet que devuelve cajas de {texto, titulo, lista, tabla, figura,
// formula, pie...} con su confianza. Aqui vive solo la inferencia; la
// geometria de ida y vuelta esta en decode.js, que es puro y testeable.
//
// La pagina que lo use necesita 'wasm-unsafe-eval' en script-src: a
// diferencia de Tesseract, el WASM se compila en el documento.

import * as ort from '/node_modules/onnxruntime-web/dist/ort.min.mjs'
import { INPUT_SIZE, fitBox, decodeDetections } from './decode.js'

const MODEL_URL = '/vendor/layout/doclaynet-yolov10m.onnx'

// El gris con el que YOLO rellena lo que no es pagina. Da igual casi siempre;
// se respeta la convencion para no regalar precision.
const PAD_GRAY = 114

export async function createLayoutModel () {
  // Un solo hilo: con varios, ort levanta workers desde blob: y la CSP los
  // bloquea. Para paginas sueltas la diferencia no se nota.
  ort.env.wasm.numThreads = 1
  ort.env.wasm.wasmPaths = '/node_modules/onnxruntime-web/dist/'

  const session = await ort.InferenceSession.create(MODEL_URL)
  const inputName = session.inputNames[0]
  const outputName = session.outputNames[0]

  return {
    /**
     * @param {HTMLCanvasElement} canvas pagina ya dibujada
     * @param {number} renderScale pixeles por punto de PDF del dibujado
     * @returns {Promise<Array>} detecciones en puntos de PDF
     */
    async detect (canvas, renderScale, minScore) {
      const fit = fitBox(canvas.width, canvas.height)

      const square = document.createElement('canvas')
      square.width = INPUT_SIZE
      square.height = INPUT_SIZE
      const ctx = square.getContext('2d', { alpha: false })
      ctx.fillStyle = `rgb(${PAD_GRAY},${PAD_GRAY},${PAD_GRAY})`
      ctx.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE)
      ctx.drawImage(canvas, 0, 0, fit.w, fit.h)

      const { data } = ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE)
      // RGBA entrelazado -> planos RGB en 0..1, que es lo que espera el modelo.
      const pixels = INPUT_SIZE * INPUT_SIZE
      const tensor = new Float32Array(pixels * 3)
      for (let i = 0; i < pixels; i++) {
        tensor[i] = data[i * 4] / 255
        tensor[i + pixels] = data[i * 4 + 1] / 255
        tensor[i + pixels * 2] = data[i * 4 + 2] / 255
      }

      const results = await session.run({
        [inputName]: new ort.Tensor('float32', tensor, [1, 3, INPUT_SIZE, INPUT_SIZE])
      })
      return decodeDetections(results[outputName].data, fit, renderScale, minScore)
    },

    close: () => session.release()
  }
}
