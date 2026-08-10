// Recortes de figura para la lectura re-maquetada.
//
// El flujo pinta el texto extraido, pero una figura no tiene texto: antes
// quedaba como un hueco en blanco sin explicacion. Aqui se recorta su region
// de la pagina original ya dibujada y se ensena esa imagen, que es el unico
// testigo fiel de lo que habia. La geometria existe desde la ingesta
// (block.rects); esto solo la lleva a pixeles.
//
// Los recortes viven en memoria como URLs de objeto y no se guardan en disco:
// solo se ven con el libro abierto, cuando el PDF ya esta en memoria, y cada
// fichero mas por libro complicaria el borrado y el barrido de huerfanos.
//
// El renderer llega de fuera en vez de importarse: asi este modulo no arrastra
// pdf.js y la geometria se puede probar en vitest.

const CACHE_SIZE = 24 // recortes vivos; un capitulo tecnico trae unos pocos
const SCALE = 2 // puntos de lienzo por punto de PDF: nitido sin exagerar
const MARGIN = 4 // aire alrededor del recorte, en puntos de PDF

/**
 * Caja de recorte en pixeles de la pagina dibujada, con margen y sin salirse.
 * @param {{x:number,y:number,w:number,h:number}} rect en puntos de PDF
 * @param {{w:number,h:number}} size tamano de la pagina en puntos
 * @param {number} scale al que se dibujo la pagina
 * @returns {{sx:number,sy:number,sw:number,sh:number}}
 */
export function clipBox (rect, size, scale, margin = MARGIN) {
  const x = Math.max(0, rect.x - margin)
  const y = Math.max(0, rect.y - margin)
  const w = Math.max(0, Math.min(size.w, rect.x + rect.w + margin) - x)
  const h = Math.max(0, Math.min(size.h, rect.y + rect.h + margin) - y)
  return { sx: x * scale, sy: y * scale, sw: w * scale, sh: h * scale }
}

/**
 * @param {Object} renderer un createPageRenderer ya abierto; close() lo cierra
 *   tambien, porque el recortador es su unico dueno en el lector de flujo
 */
export function createFigureClips (renderer) {
  const cache = new Map() // blockIndex -> { url, w, h }
  const pending = new Map()

  function evict () {
    while (cache.size > CACHE_SIZE) {
      const [oldest, entry] = cache.entries().next().value
      URL.revokeObjectURL(entry.url)
      cache.delete(oldest)
    }
  }

  async function cut (book, blockIndex) {
    const rect = book.blocks[blockIndex]?.rects?.[0]
    if (!rect || !(rect.w > 0 && rect.h > 0)) return null

    const size = book.pageSizes?.[rect.page] ?? { w: 612, h: 792 }
    const entry = await renderer.get(rect.page + 1, SCALE)

    // La pagina llega como URL de imagen, no como lienzo: hay que descodificarla
    // para poder recortar. El renderer la tiene en su cache, asi que varias
    // figuras de la misma pagina no la dibujan mas que una vez.
    const image = new Image()
    image.src = entry.url
    await image.decode()

    const box = clipBox(rect, size, entry.scale)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(box.sw))
    canvas.height = Math.max(1, Math.round(box.sh))
    const ctx = canvas.getContext('2d', { alpha: false })
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(image, box.sx, box.sy, box.sw, box.sh, 0, 0, canvas.width, canvas.height)

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9))
    if (!blob) throw new Error(`no se pudo recortar la figura del bloque ${blockIndex}`)
    return { url: URL.createObjectURL(blob), w: canvas.width, h: canvas.height }
  }

  return {
    /** @returns {Promise<{url:string,w:number,h:number}|null>} */
    async get (book, blockIndex) {
      const hit = cache.get(blockIndex)
      if (hit) {
        cache.delete(blockIndex)
        cache.set(blockIndex, hit)
        return hit
      }
      if (pending.has(blockIndex)) return pending.get(blockIndex)

      const promise = cut(book, blockIndex).then(entry => {
        pending.delete(blockIndex)
        if (entry) { cache.set(blockIndex, entry); evict() }
        return entry
      }).catch(err => {
        pending.delete(blockIndex)
        throw err
      })

      pending.set(blockIndex, promise)
      return promise
    },

    close () {
      for (const entry of cache.values()) URL.revokeObjectURL(entry.url)
      cache.clear()
      pending.clear()
      renderer.close()
    }
  }
}
