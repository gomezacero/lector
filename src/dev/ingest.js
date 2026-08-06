// Pagina sin interfaz que corre el pipeline sobre un PDF y publica el
// resultado en window.__ingest para que la tarea de Electron lo recoja.
// Ademas vuelca las lineas de las primeras paginas: son el fixture con el que
// se prueban blocks.js y chapters.js sin necesidad de pdf.js.

import { openDocument, closeDocument, extractPage } from '/src/pdf/extract.js'
import { buildLines } from '/src/pdf/lines.js'
import { buildBook } from '/src/pdf/pipeline.js'

const FIXTURE_PAGES = 8

async function run () {
  const pdfPath = new URLSearchParams(location.search).get('pdf')
  if (!pdfPath) throw new Error('falta el parametro ?pdf=')

  const loaded = await window.lector.pdf.load(pdfPath)
  if (loaded?.error) throw new Error(`no se pudo leer ${pdfPath}: ${loaded.error}`)

  const doc = await openDocument(loaded.bytes)
  const pages = []
  for (let n = 1; n <= Math.min(doc.numPages, FIXTURE_PAGES); n++) {
    const page = await extractPage(doc, n)
    pages.push({ width: page.width, height: page.height, lines: buildLines(page, n - 1) })
  }
  await closeDocument(doc)

  const t0 = performance.now()
  const book = await buildBook(loaded.bytes, { fileName: loaded.fileName })
  const ms = performance.now() - t0

  return { book, pages, timing: { ms, perPage: ms / book.pageCount, bytes: loaded.size } }
}

run()
  .then(result => { window.__ingest = { ok: true, ...result } })
  .catch(err => {
    console.error(err)
    window.__ingest = { ok: false, error: err.message }
  })
