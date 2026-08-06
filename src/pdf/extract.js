// Unico modulo que habla con pdf.js. Convierte un PDF en items de texto
// normalizados: coordenadas de arriba a abajo y unidades comparables entre
// paginas. Todo lo que viene despues (lines, blocks, chapters) es logica pura
// y no sabe que existe pdf.js.

import * as pdfjsLib from '/node_modules/pdfjs-dist/build/pdf.mjs'
import { extractDrawings, mergeDrawings } from './graphics.js'

pdfjsLib.GlobalWorkerOptions.workerSrc = '/node_modules/pdfjs-dist/build/pdf.worker.mjs'

const RESOURCES = {
  cMapUrl: '/node_modules/pdfjs-dist/cmaps/',
  cMapPacked: true,
  standardFontDataUrl: '/node_modules/pdfjs-dist/standard_fonts/'
}

export function openDocument (bytes) {
  return pdfjsLib.getDocument({
    // pdf.js transfiere el buffer al worker y lo deja detached. Sin esta copia,
    // quien nos paso los bytes se queda sin ellos y un segundo uso revienta.
    data: new Uint8Array(bytes),
    ...RESOURCES,
    // Solo se extrae texto: nada de esto hace falta y ahorra trabajo.
    isEvalSupported: false,
    disableFontFace: true
  }).promise
}

/** Libera el worker. En pdf.js 6 destroy() vive en el loading task, no en el doc. */
export function closeDocument (doc) {
  return doc?.loadingTask?.destroy() ?? Promise.resolve()
}

/**
 * Items de una pagina, con el origen movido a la esquina superior izquierda.
 * @returns {{width:number, height:number, items:Array}}
 */
export async function extractPage (doc, pageNumber, { withDrawings = false } = {}) {
  const page = await doc.getPage(pageNumber)
  const viewport = page.getViewport({ scale: 1 })
  const content = await page.getTextContent()

  // Solo se piden los dibujos cuando hacen falta: la lista de operaciones es
  // bastante mas cara de obtener que el texto.
  const drawings = withDrawings
    ? mergeDrawings(extractDrawings(await page.getOperatorList(), viewport.transform, pdfjsLib.OPS))
    : []

  const items = []
  for (const item of content.items) {
    if (item.type === 'beginMarkedContent' || typeof item.str !== 'string') continue
    if (item.str === '') continue

    const [a, b, c, d, e, f] = item.transform
    // Texto girado (marcas de agua, titulillos verticales): no es prosa.
    const rotated = Math.abs(b) > 0.01 || Math.abs(c) > 0.01
    const size = item.height || Math.hypot(b, d) || Math.abs(d)

    items.push({
      text: item.str,
      x: e,
      // pdf.js da el origen abajo a la izquierda; aqui todo crece hacia abajo.
      y: viewport.height - f,
      w: item.width,
      h: size,
      font: item.fontName ?? '',
      // hasEOL marca fin de linea segun el propio PDF, cuando lo declara.
      eol: item.hasEOL === true,
      rotated,
      scaleX: a
    })
  }

  page.cleanup()
  return { width: viewport.width, height: viewport.height, items, drawings }
}

/** Indice del PDF, si el documento lo declara. */
export async function extractOutline (doc) {
  const outline = await doc.getOutline().catch(() => null)
  if (!outline?.length) return []

  const flat = []
  const walk = async (nodes, depth) => {
    for (const node of nodes) {
      const page = await resolvePageIndex(doc, node.dest)
      if (page !== null) flat.push({ title: (node.title ?? '').trim(), page, depth })
      if (node.items?.length) await walk(node.items, depth + 1)
    }
  }
  await walk(outline, 0)
  return flat.filter(e => e.title)
}

async function resolvePageIndex (doc, dest) {
  try {
    const target = typeof dest === 'string' ? await doc.getDestination(dest) : dest
    if (!Array.isArray(target) || !target[0]) return null
    return await doc.getPageIndex(target[0])
  } catch {
    return null
  }
}

/** Titulo y autor declarados en los metadatos del PDF. */
export async function extractMetadata (doc) {
  try {
    const { info } = await doc.getMetadata()
    return {
      title: clean(info?.Title),
      author: clean(info?.Author)
    }
  } catch {
    return { title: '', author: '' }
  }
}

function clean (value) {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  // Muchos generadores dejan basura: rutas, "untitled", el nombre del programa.
  if (!trimmed || /^(untitled|microsoft word|document\d*)/i.test(trimmed)) return ''
  if (/\.(pdf|docx?|indd|tex)$/i.test(trimmed)) return trimmed.replace(/\.[^.]+$/, '')
  return trimmed
}
