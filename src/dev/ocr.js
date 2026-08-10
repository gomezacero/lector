// Pagina sin interfaz que rasteriza un PDF, lo pasa por Tesseract y publica
// el resultado en window.__ocr para que la tarea de Electron lo recoja.
//
// Hace de dos cosas a la vez:
//  - Prueba de arranque: si el worker de Tesseract no pasa la CSP o el WASM
//    no compila, es aqui donde falla, con el error a la vista.
//  - Fabrica de fixtures: publica los bloques crudos de Tesseract (podados a
//    lo que usa toItems) y los JPEG de las paginas, con los que la tarea
//    escribe el fixture de vitest y un PDF "escaneado" con texto conocido.

import { openDocument, closeDocument } from '/src/pdf/extract.js'
import { createOcrEngine } from '/src/ocr/engine.js'
import { toItems } from '/src/ocr/toItems.js'
import { buildLines } from '/src/pdf/lines.js'
import { toBlocks } from '/src/pdf/blocks.js'

// ~288 ppp: suficiente para tipografia de libro sin disparar la memoria.
const SCALE = 4
const MAX_PAGES = 4

async function run () {
  const pdfPath = new URLSearchParams(location.search).get('pdf')
  if (!pdfPath) throw new Error('falta el parametro ?pdf=')

  const loaded = await window.lector.pdf.load(pdfPath)
  if (loaded?.error) throw new Error(`no se pudo leer ${pdfPath}: ${loaded.error}`)

  const doc = await openDocument(loaded.bytes)
  const pages = []
  try {
    for (let n = 1; n <= Math.min(doc.numPages, MAX_PAGES); n++) {
      const page = await doc.getPage(n)
      const viewport = page.getViewport({ scale: SCALE })
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(viewport.width)
      canvas.height = Math.round(viewport.height)
      const ctx = canvas.getContext('2d', { alpha: false })
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvasContext: ctx, viewport }).promise
      page.cleanup()
      pages.push({ canvas, width: viewport.width / SCALE, height: viewport.height / SCALE })
    }
  } finally {
    await closeDocument(doc)
  }

  const t0 = performance.now()
  const engine = await createOcrEngine()
  const booted = performance.now() - t0

  const results = []
  for (const page of pages) {
    const started = performance.now()
    const blocks = await engine.recognize(page.canvas)
    const { items, confidence } = toItems(blocks, { scale: SCALE })
    results.push({
      width: page.width,
      height: page.height,
      blocks: prune(blocks),
      items,
      confidence,
      ms: performance.now() - started
    })
  }
  await engine.terminate()

  // Reconstruccion con el pipeline puro: la prueba de que los items de OCR
  // hablan el mismo idioma que los de extractPage.
  const linePages = results.map((r, i) => ({
    width: r.width,
    height: r.height,
    lines: buildLines({ width: r.width, height: r.height, items: r.items, drawings: [], images: [] }, i)
  }))
  const { blocks } = toBlocks(linePages)

  return {
    booted,
    results,
    blockTexts: blocks.map(b => b.text),
    scale: SCALE,
    jpegs: pages.map(p => ({
      data: p.canvas.toDataURL('image/jpeg', 0.85).split(',')[1],
      width: p.canvas.width,
      height: p.canvas.height
    }))
  }
}

/** Solo los campos que consume toItems: el resto (simbolos, alternativas)
 *  multiplica por diez el peso del fixture sin aportar nada al test. */
function prune (blocks) {
  return (blocks ?? []).map(b => ({
    bbox: b.bbox,
    paragraphs: (b.paragraphs ?? []).map(p => ({
      bbox: p.bbox,
      lines: (p.lines ?? []).map(l => ({
        bbox: l.bbox,
        baseline: l.baseline,
        rowAttributes: l.rowAttributes,
        words: (l.words ?? []).map(w => ({ text: w.text, confidence: w.confidence, bbox: w.bbox }))
      }))
    }))
  }))
}

run()
  .then(result => { window.__ocr = { ok: true, ...result } })
  .catch(err => {
    console.error(err)
    window.__ocr = { ok: false, error: err.message }
  })
