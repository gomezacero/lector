// Dibuja paginas del PDF y las sirve como imagen.
//
// La vista de regiones ensena el documento tal y como esta compuesto, asi que
// necesita la pagina pintada de verdad, no el texto extraido. Se dibuja a
// demanda: un libro de 800 paginas no cabe en memoria.
//
// La imagen se entrega como URL de objeto para poder ponerla en las dos capas
// —la difuminada y la nitida— sin dibujarla dos veces; el navegador la
// descodifica una sola vez y las dos capas comparten el mismo mapa de bits.

import { openDocument, closeDocument } from './extract.js'

const CACHE_SIZE = 6 // paginas dibujadas que se conservan

const COVER_WIDTH = 420 // suficiente para la estanteria en pantallas densas

/**
 * Dibuja la primera pagina y la guarda como portada del libro.
 *
 * Se hace una sola vez, al conocer el libro: es la unica imagen real que tiene
 * un PDF, y una estanteria sin portadas son fichas de archivo.
 */
export async function makeCover (bytes, id) {
  if (await window.lector.book.hasCover(id)) return

  const doc = await openDocument(bytes)
  try {
    const page = await doc.getPage(1)
    const base = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: COVER_WIDTH / base.width })

    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)

    const ctx = canvas.getContext('2d', { alpha: false })
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: ctx, viewport }).promise
    page.cleanup()

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.82))
    await window.lector.book.writeCover(id, new Uint8Array(await blob.arrayBuffer()))
  } finally {
    await closeDocument(doc)
  }
}

export function createPageRenderer () {
  let doc = null
  const cache = new Map() // pageNumber -> { url, width, height }
  const pending = new Map()

  function evict () {
    while (cache.size > CACHE_SIZE) {
      const [oldest, entry] = cache.entries().next().value
      URL.revokeObjectURL(entry.url)
      cache.delete(oldest)
    }
  }

  async function draw (pageNumber, scale) {
    const page = await doc.getPage(pageNumber)
    const viewport = page.getViewport({ scale })

    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)

    const ctx = canvas.getContext('2d', { alpha: false })
    // Un lienzo sin canal alfa arranca en negro, y casi ningun PDF pinta su
    // propio fondo: sin esto la pagina sale negra sobre negro.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    await page.render({ canvasContext: ctx, viewport }).promise
    page.cleanup()

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9))
    if (!blob) throw new Error(`no se pudo convertir la pagina ${pageNumber}`)
    return { url: URL.createObjectURL(blob), width: canvas.width, height: canvas.height, scale }
  }

  return {
    async open (bytes) {
      this.close()
      doc = await openDocument(bytes)
      return doc.numPages
    },

    /**
     * @param {number} pageNumber 1-based
     * @param {number} scale puntos de pantalla por punto de PDF
     */
    async get (pageNumber, scale) {
      const key = `${pageNumber}@${scale.toFixed(2)}`
      const hit = cache.get(key)
      if (hit) {
        // Renovar su sitio en la cola: lo recien usado se descarta al final.
        cache.delete(key)
        cache.set(key, hit)
        return hit
      }
      // Sin esto, mover el foco dos veces seguidas dibujaria la pagina dos veces.
      if (pending.has(key)) return pending.get(key)

      const promise = draw(pageNumber, scale).then(entry => {
        cache.set(key, entry)
        pending.delete(key)
        evict()
        return entry
      }).catch(err => {
        pending.delete(key)
        throw err
      })

      pending.set(key, promise)
      return promise
    },

    /** Adelanta el dibujado de una pagina para que el salto no se note. */
    prefetch (pageNumber, scale) {
      if (!doc || pageNumber < 1 || pageNumber > doc.numPages) return
      this.get(pageNumber, scale).catch(() => {})
    },

    close () {
      for (const entry of cache.values()) URL.revokeObjectURL(entry.url)
      cache.clear()
      pending.clear()
      if (doc) closeDocument(doc)
      doc = null
    },

    get isOpen () { return doc !== null }
  }
}
