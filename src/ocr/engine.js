// Arranque y uso de Tesseract, todo local.
//
// El worker, el nucleo WASM y los idiomas se sirven por app:// desde el
// propio paquete: la aplicacion no toca la red, que es una promesa de
// diseno (la CSP dice default-src 'none' y aqui no se abre ninguna puerta).
//
// workerBlobURL: false es la pieza que casa con la CSP. Por defecto
// tesseract.js envuelve su worker en un blob:, y worker-src 'self' lo
// bloquearia; cargandolo directo de su URL es un worker de mismo origen y
// pasa. El WASM se compila DENTRO del worker, cuyo contexto no hereda la CSP
// del documento, asi que tampoco hace falta 'wasm-unsafe-eval' en la pagina.

// El bundle ESM de tesseract.js solo tiene export default (el objeto UMD).
import Tesseract from '/node_modules/tesseract.js/dist/tesseract.esm.min.js'

const { createWorker } = Tesseract

const OPTIONS = {
  workerPath: '/node_modules/tesseract.js/dist/worker.min.js',
  corePath: '/node_modules/tesseract.js-core',
  langPath: '/vendor/tesseract',
  gzip: true,
  workerBlobURL: false
}

// Espanol e ingles: los idiomas de la biblioteca del usuario. Cada idioma
// mas son ~10 MB de paquete y algo de memoria del reconocedor.
const LANGS = ['spa', 'eng']

// OEM 1: solo el motor LSTM, que es el unico cuyos traineddata empaquetamos.
const LSTM_ONLY = 1

/**
 * @returns {Promise<{recognize:(canvas:HTMLCanvasElement)=>Promise<Array>, terminate:()=>Promise<void>}>}
 */
export async function createOcrEngine () {
  const worker = await createWorker(LANGS, LSTM_ONLY, OPTIONS)
  return {
    /** Reconoce un lienzo ya rasterizado y devuelve los bloques con cajas. */
    async recognize (canvas) {
      const { data } = await worker.recognize(canvas, {}, { blocks: true, text: false })
      return data.blocks ?? []
    },
    terminate: () => worker.terminate()
  }
}
