// Analisis de layout en segundo plano de las paginas complejas de un libro.
//
// Mismo esquema que el OCR: corre mientras se lee, guarda el resultado en
// books/<id>.layout.json cada pocas paginas y se reanuda si la aplicacion se
// cierra a mitad. Al terminar, la vista de pagina reconstruye sus paradas con
// las cajas del modelo.
//
// El modelo se carga con import dinamico a proposito: si no esta empaquetado
// —su licencia se decide aparte— la aplicacion ni siquiera descarga el motor
// ONNX, y las heuristicas mandan como siempre.

import { openDocument, closeDocument } from '../pdf/extract.js'

// Copia del literal de layoutModel.js: importarlo aqui solo para leer la
// constante arrastraria el motor ONNX entero al arranque.
const MODEL_URL = '/vendor/layout/doclaynet-yolov10m.onnx'

const RENDER_SCALE = 2
const SAVE_EVERY = 4

/** Si el modelo viaja con esta instalacion. Sin red: app:// o nada. */
export async function layoutAvailable () {
  try {
    return (await fetch(MODEL_URL, { method: 'HEAD' })).ok
  } catch {
    return false
  }
}

/**
 * @param {{id:string, bytes:Uint8Array, pages:number[],
 *          onProgress?:(done:number,total:number)=>void,
 *          onDone?:(stored:Object)=>void, onError?:(err:Error)=>void}} wiring
 *   pages: indices (base 0) de las paginas a analizar
 */
export function createLayoutRun ({ id, bytes, pages, onProgress, onDone, onError }) {
  let cancelled = false

  async function start () {
    let doc = null
    let model = null
    try {
      const stored = (await window.lector.layout.read(id)) ?? { version: 1, pages: {} }
      const pending = pages.filter(page => !stored.pages[page])
      if (!pending.length) {
        onDone?.(stored)
        return
      }

      const { createLayoutModel } = await import('./layoutModel.js')
      doc = await openDocument(bytes)
      model = await createLayoutModel()

      let done = pages.length - pending.length
      let sinceSave = 0
      onProgress?.(done, pages.length)

      for (const page of pending) {
        if (cancelled) break
        const canvas = await draw(doc, page)
        const detections = await model.detect(canvas, RENDER_SCALE)
        if (cancelled) break

        stored.pages[page] = detections
        done++
        sinceSave++
        onProgress?.(done, pages.length)

        if (sinceSave >= SAVE_EVERY) {
          await window.lector.layout.write(id, stored)
          sinceSave = 0
        }
      }

      if (sinceSave > 0) await window.lector.layout.write(id, stored)
      if (!cancelled) onDone?.(stored)
    } catch (err) {
      if (!cancelled) onError?.(err)
    } finally {
      model?.close()
      if (doc) await closeDocument(doc)
    }
  }

  async function draw (doc, pageIndex) {
    const page = await doc.getPage(pageIndex + 1)
    const viewport = page.getViewport({ scale: RENDER_SCALE })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    const ctx = canvas.getContext('2d', { alpha: false })
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: ctx, viewport }).promise
    page.cleanup()
    return canvas
  }

  return {
    start,
    cancel () { cancelled = true }
  }
}
