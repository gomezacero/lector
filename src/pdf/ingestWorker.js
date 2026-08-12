// La ingesta, fuera del hilo de la ventana.
//
// buildBook tarda segundos con un libro grande y, corriendo en el renderer,
// congelaba la interfaz por mucho yield que hiciera: el trabajo caro entre
// cesiones es sincrono. Aqui corre entero en un worker y la ventana queda
// libre; pdf.js levanta su propio worker anidado, que Chromium permite y la
// CSP (worker-src 'self') cubre igual.
//
// Protocolo: entra { bytes, fileName, ocrItemsByPage }, salen mensajes
// etiquetados con lector: 'progress', 'book' o 'error'. La etiqueta no es
// adorno: cuando pdf.js cae a su "fake worker" comparte este hilo y sus
// mensajes internos de handshake tambien salen por self.postMessage; sin
// etiqueta, el primero de ellos se tomaba por resultado.

import { buildBook } from './pipeline.js'

self.onmessage = async ({ data }) => {
  // Solo el encargo inicial es nuestro: pdf.js en modo fake worker escucha
  // este mismo canal y no hay que confundir sus mensajes con otro encargo.
  if (!data || !data.lector) return
  try {
    const book = await buildBook(data.bytes, {
      fileName: data.fileName,
      ocrItemsByPage: data.ocrItemsByPage,
      onProgress: (done, total) => self.postMessage({ lector: 'progress', done, total })
    })
    self.postMessage({ lector: 'book', book })
  } catch (err) {
    self.postMessage({ lector: 'error', error: err?.stack ?? err?.message ?? String(err) })
  }
}
