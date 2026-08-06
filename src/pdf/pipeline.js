// Orquesta la ingesta: PDF -> Book listo para leer.
// No contiene heuristicas propias; solo encadena los modulos y les da forma.

import { openDocument, closeDocument, extractPage, extractOutline, extractMetadata } from './extract.js'
import { buildLines } from './lines.js'
import { toBlocks } from './blocks.js'
import { buildChapters } from './chapters.js'

// Sube este numero al cambiar el pipeline: invalida los libros ya cacheados.
export const CACHE_VERSION = 2

/**
 * @param {Uint8Array} bytes
 * @param {{fileName?:string, onProgress?:(done:number,total:number)=>void}} options
 * @returns {Promise<Object>} Book
 */
export async function buildBook (bytes, { fileName = '', onProgress } = {}) {
  const doc = await openDocument(bytes)

  try {
    const pages = []
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await extractPage(doc, n, { withDrawings: true })
      pages.push({ width: page.width, height: page.height, lines: buildLines(page, n - 1) })
      onProgress?.(n, doc.numPages)
      // Un libro de 400 paginas congelaria la ventana varios segundos: cada
      // pocas paginas se devuelve el hilo para que el aviso de carga se pinte.
      if (n % 8 === 0) await new Promise(resolve => setTimeout(resolve, 0))
    }

    const [outline, meta] = await Promise.all([extractOutline(doc), extractMetadata(doc)])
    const { blocks, metrics, style } = toBlocks(pages)
    const chapters = buildChapters(blocks, outline)

    // Offset de caracter acumulado: es el ancla estable del progreso y de las
    // notas, la unica que sobrevive a un cambio de tipografia.
    let chars = 0
    for (const block of blocks) {
      block.start = chars
      chars += block.text.length + 1
    }

    return {
      version: CACHE_VERSION,
      title: meta.title || firstHeading(blocks) || cleanFileName(fileName),
      author: meta.author,
      pageCount: doc.numPages,
      // Tamano de cada pagina: sin el no se pueden llevar los rectangulos de
      // los bloques a la pantalla. No todas las paginas miden igual.
      pageSizes: pages.map(p => ({ w: Math.round(p.width), h: Math.round(p.height) })),
      chars,
      blocks,
      chapters,
      stats: {
        paragraphStyle: style,
        // Con que se decide si el libro se lee re-maquetado o sobre la pagina
        // original: la prosa corriente no trae ni figuras ni columnas.
        figures: blocks.filter(b => b.type === 'figure').length,
        columnPages: pages.filter(p => p.lines.some(l => l.columnLeft !== undefined)).length,
        bodySize: Math.round(metrics.bodySize * 10) / 10,
        // Las medidas con las que se decide donde empieza cada parrafo. Se
        // guardan porque son lo primero que hay que mirar cuando un libro sale
        // con los parrafos partidos o pegados.
        bodyLeft: Math.round(metrics.bodyLeft),
        bodyRight: Math.round(metrics.bodyRight),
        leading: Math.round(metrics.leading * 10) / 10,
        words: countWords(blocks)
      }
    }
  } finally {
    await closeDocument(doc)
  }
}

const firstHeading = blocks => blocks.find(b => b.type === 'heading')?.text ?? ''

const countWords = blocks =>
  blocks.reduce((total, b) => total + (b.text.match(/\S+/g)?.length ?? 0), 0)

function cleanFileName (fileName) {
  return fileName
    .replace(/\.pdf$/i, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'Sin título'
}
