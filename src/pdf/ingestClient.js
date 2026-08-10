// Lado ventana de la ingesta en worker: la misma firma que buildBook, con el
// trabajo en otro hilo. Distingue dos fallos que no se parecen en nada:
//
// - El pipeline fallo (PDF corrupto, cifrado): llega como { error } y se
//   rechaza tal cual. Repetirlo en el hilo principal daria el mismo error.
// - El worker no llego a arrancar (script que no carga, entorno sin workers
//   anidados): se rechaza con name = 'WorkerUnavailable' para que quien llama
//   pueda caer al hilo principal y el libro se abra igual, aunque se sienta.

export function buildBookInWorker (bytes, { fileName, ocrItemsByPage, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    let worker
    try {
      worker = new Worker('/src/pdf/ingestWorker.js', { type: 'module' })
    } catch (err) {
      err.name = 'WorkerUnavailable'
      return reject(err)
    }

    const finish = (fn, value) => {
      worker.terminate()
      fn(value)
    }

    worker.onmessage = ({ data }) => {
      // Solo los mensajes etiquetados son nuestros: el fake worker de pdf.js
      // comparte el canal y su handshake llega por aqui tambien.
      if (data?.lector === 'progress') return onProgress?.(data.done, data.total)
      if (data?.lector === 'error') return finish(reject, new Error(data.error))
      if (data?.lector === 'book') return finish(resolve, data.book)
    }

    worker.onerror = event => {
      const err = new Error(event.message || 'el worker de ingesta no arrancó')
      err.name = 'WorkerUnavailable'
      finish(reject, err)
    }

    // Los bytes se clonan, no se transfieren: quien llama los sigue usando
    // (la vista de página dibuja del mismo array durante toda la sesión).
    worker.postMessage({ lector: 'build', bytes, fileName, ocrItemsByPage })
  })
}
