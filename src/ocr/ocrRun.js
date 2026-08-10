// Reconocimiento en segundo plano de las paginas escaneadas de un libro.
//
// Corre mientras se hojea: rasteriza cada pagina escaneada, la pasa por
// Tesseract y guarda el resultado en books/<id>.ocr.json cada pocas paginas.
// Si la aplicacion se cierra a mitad, la proxima vez se reanuda por donde
// iba: un libro de 300 paginas son minutos de CPU y no se tiran.
//
// Este modulo solo produce el fichero de items; aplicarlo al libro (el
// reproceso con buildBook y el re-anclaje del progreso) es cosa de app.js.

import { openDocument, closeDocument } from '../pdf/extract.js'
import { createOcrEngine } from './engine.js'
import { toItems } from './toItems.js'

// ~288 ppp sobre puntos de PDF: suficiente para tipografia de libro. El techo
// de pixeles protege de paginas A3 o carteles, donde 4x se dispara.
const SCALE = 4
const MAX_SIDE = 4200

// Cada cuantas paginas reconocidas se escribe el parcial a disco.
const SAVE_EVERY = 5

/**
 * @param {{id:string, book:Object, bytes:Uint8Array,
 *          onProgress?:(done:number,total:number)=>void,
 *          onDone?:(pages:Object)=>void, onError?:(err:Error)=>void}} wiring
 */
export function createOcrRun ({ id, book, bytes, onProgress, onDone, onError }) {
  let cancelled = false

  async function start () {
    let doc = null
    let engine = null
    try {
      const stored = (await window.lector.ocr.read(id)) ?? { version: 1, pages: {} }
      const targets = book.pageKinds
        .map((kind, index) => kind === 'scanned' ? index : -1)
        .filter(index => index >= 0)
      const pending = targets.filter(index => !stored.pages[index])

      if (!pending.length) {
        onDone?.(stored.pages)
        return
      }

      doc = await openDocument(bytes)
      engine = await createOcrEngine()

      let done = targets.length - pending.length
      let sinceSave = 0
      onProgress?.(done, targets.length)

      for (const pageIndex of pending) {
        if (cancelled) break
        const { canvas, scale } = await draw(doc, pageIndex)
        const blocks = await engine.recognize(canvas)
        // Reconocer tarda segundos: el libro puede haberse cerrado mientras.
        if (cancelled) break

        stored.pages[pageIndex] = toItems(blocks, { scale })
        done++
        sinceSave++
        onProgress?.(done, targets.length)

        if (sinceSave >= SAVE_EVERY) {
          await window.lector.ocr.write(id, stored)
          sinceSave = 0
        }
      }

      // Tambien al cancelar: lo reconocido hasta aqui se reanuda otro dia.
      if (sinceSave > 0) await window.lector.ocr.write(id, stored)
      if (!cancelled) onDone?.(stored.pages)
    } catch (err) {
      if (!cancelled) onError?.(err)
    } finally {
      await engine?.terminate().catch(() => {})
      if (doc) await closeDocument(doc)
    }
  }

  async function draw (doc, pageIndex) {
    const page = await doc.getPage(pageIndex + 1)
    const base = page.getViewport({ scale: 1 })
    const scale = Math.min(SCALE, MAX_SIDE / Math.max(base.width, base.height))
    const viewport = page.getViewport({ scale })

    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    const ctx = canvas.getContext('2d', { alpha: false })
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: ctx, viewport }).promise
    page.cleanup()

    return { canvas, scale }
  }

  return {
    start,
    cancel () { cancelled = true }
  }
}
