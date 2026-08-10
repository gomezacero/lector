// Pagina sin interfaz que pasa el modelo de layout por paginas concretas de
// un PDF y publica en window.__layout las detecciones y las paginas anotadas
// (cada caja dibujada con su clase y su confianza), para poder VER que
// entiende el modelo antes de decidir si entra en la aplicacion.

import { openDocument, closeDocument } from '/src/pdf/extract.js'
import { createLayoutModel } from '/src/layout/layoutModel.js'

const RENDER_SCALE = 2
const MIN_SCORE = 0.3

// Un color por clase, elegidos para distinguirse sobre una pagina blanca.
const COLORS = {
  caption: '#e67e22',
  footnote: '#95a5a6',
  formula: '#9b59b6',
  'list-item': '#16a085',
  'page-footer': '#7f8c8d',
  'page-header': '#7f8c8d',
  picture: '#2980b9',
  'section-header': '#c0392b',
  table: '#d35400',
  text: '#27ae60',
  title: '#8e44ad'
}

async function run () {
  const params = new URLSearchParams(location.search)
  const pdfPath = params.get('pdf')
  const pages = (params.get('pages') ?? '1')
    .split(',').map(n => parseInt(n, 10)).filter(n => n >= 1)
  if (!pdfPath) throw new Error('falta el parametro ?pdf=')

  const loaded = await window.lector.pdf.load(pdfPath)
  if (loaded?.error) throw new Error(`no se pudo leer ${pdfPath}: ${loaded.error}`)

  const doc = await openDocument(loaded.bytes)
  const t0 = performance.now()
  const model = await createLayoutModel()
  const booted = performance.now() - t0

  const results = []
  try {
    for (const pageNumber of pages) {
      if (pageNumber > doc.numPages) continue
      const page = await doc.getPage(pageNumber)
      const viewport = page.getViewport({ scale: RENDER_SCALE })
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(viewport.width)
      canvas.height = Math.round(viewport.height)
      const ctx = canvas.getContext('2d', { alpha: false })
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvasContext: ctx, viewport }).promise
      page.cleanup()

      const started = performance.now()
      const detections = await model.detect(canvas, RENDER_SCALE, MIN_SCORE)
      const ms = performance.now() - started

      annotate(ctx, detections)
      results.push({
        page: pageNumber,
        ms,
        detections,
        image: canvas.toDataURL('image/png').split(',')[1]
      })
    }
  } finally {
    model.close()
    await closeDocument(doc)
  }

  return { booted, results }
}

/** Dibuja cada deteccion sobre la pagina: caja, clase y confianza. */
function annotate (ctx, detections) {
  ctx.font = 'bold 22px system-ui'
  ctx.lineWidth = 4
  for (const d of detections) {
    const color = COLORS[d.label] ?? '#000'
    const [x, y, w, h] = [d.x, d.y, d.w, d.h].map(v => v * RENDER_SCALE)
    ctx.strokeStyle = color
    ctx.strokeRect(x, y, w, h)

    const tag = `${d.label} ${Math.round(d.score * 100)}%`
    const width = ctx.measureText(tag).width + 12
    ctx.fillStyle = color
    ctx.fillRect(x, Math.max(0, y - 26), width, 26)
    ctx.fillStyle = '#fff'
    ctx.fillText(tag, x + 6, Math.max(20, y - 6))
  }
}

run()
  .then(result => { window.__layout = { ok: true, ...result } })
  .catch(err => {
    console.error(err)
    window.__layout = { ok: false, error: err.message }
  })
