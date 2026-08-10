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
    let stored = null
    let dirty = false
    try {
      stored = (await window.lector.ocr.read(id)) ?? { version: 1, pages: {} }
      // Al motor van las escaneadas y las sospechosas (texto corrupto): en
      // las dos el reconocimiento es la unica via hacia texto de verdad.
      const targets = book.pageKinds
        .map((kind, index) => kind === 'scanned' || kind === 'suspect' ? index : -1)
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
      let cursor = 0
      onProgress?.(done, targets.length)

      // Tantas paginas en vuelo como reconocedores: el scheduler reparte y el
      // rasterizado de la siguiente se solapa con el reconocimiento.
      const lane = async () => {
        while (!cancelled) {
          const at = cursor++
          if (at >= pending.length) return
          const pageIndex = pending[at]
          try {
            const { canvas, scale } = await draw(doc, pageIndex)
            const blocks = await engine.recognize(canvas)
            if (cancelled) return
            stored.pages[pageIndex] = toItems(blocks, { scale })
            dirty = true
          } catch (err) {
            // Una pagina mala (un canvas que no cabe, un fallo del motor) no
            // tira el libro entero: se salta y otra sesion la reintentara.
            console.warn(`OCR: fallo la página ${pageIndex + 1}:`, err?.message ?? err)
          }
          done++
          sinceSave++
          onProgress?.(done, targets.length)
          if (sinceSave >= SAVE_EVERY) {
            sinceSave = 0
            await window.lector.ocr.write(id, stored)
            dirty = false
          }
        }
      }
      await Promise.all(Array.from({ length: engine.concurrency }, lane))

      // El resto pendiente se escribe ANTES de avisar: onDone relee el
      // fichero de disco para reconstruir el libro, y sin esto le faltarian
      // las ultimas paginas (o todas, en un libro corto).
      if (dirty) {
        await window.lector.ocr.write(id, stored)
        dirty = false
      }
      if (!cancelled) onDone?.(stored.pages)
    } catch (err) {
      if (!cancelled) onError?.(err)
    } finally {
      // Tambien al cancelar o tras un fallo: lo reconocido no se tira.
      if (stored && dirty) await window.lector.ocr.write(id, stored).catch(() => {})
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
