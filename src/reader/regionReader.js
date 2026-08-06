// Lectura sobre la pagina original, resaltando una region cada vez.
//
// Para un texto tecnico no vale re-maquetar: las formulas, las tablas y las
// graficas se desmontan. Aqui la pagina se ensena tal cual y lo unico que hace
// la aplicacion es guiar la vista, resaltando el parrafo o la figura que toca y
// atenuando el resto.
//
// Ofrece la misma interfaz que el lector de lineas para que el resto de la
// aplicacion no tenga que saber en cual de los dos modos esta.

import { createPageRenderer } from '../pdf/pageRender.js'
import { chapterAtOffset, percentAt, makeProgress, blockAtOffset, startOffset } from './progress.js'
import { buildRegions } from './regions.js'

const SAVE_DELAY = 900

export function createRegionReader ({ stage, sharpLayer, contentSharp, contentDim, onStatus, onSave }) {
  const renderer = createPageRenderer()
  const images = { sharp: null, dim: null }

  let book = null
  let notes = null
  let regions = []
  let index = 0
  let anchor = 0
  let shownPage = -1
  let saveTimer = null
  let zoom = 1


  function prepareLayers () {
    images.sharp = document.createElement('img')
    images.dim = document.createElement('img')
    for (const img of [images.sharp, images.dim]) {
      img.className = 'page-image'
      img.alt = ''
      img.draggable = false
    }
    contentSharp.replaceChildren(images.sharp)
    contentDim.replaceChildren(images.dim)
  }

  /** Puntos de pantalla por punto de PDF con los que se dibuja la pagina. */
  function scaleFor (pageNumber) {
    const size = book.pageSizes?.[pageNumber] ?? { w: 612, h: 792 }
    const fit = Math.min(stage.clientWidth / size.w, stage.clientHeight / size.h)
    return { fit: fit * zoom, size }
  }

  async function showPage (pageNumber) {
    const { fit, size } = scaleFor(pageNumber)
    // Se dibuja a la resolucion real de la pantalla o el texto sale borroso.
    const entry = await renderer.get(pageNumber + 1, fit * (window.devicePixelRatio || 1))

    for (const img of [images.sharp, images.dim]) {
      img.src = entry.url
      img.width = Math.round(size.w * fit)
      img.height = Math.round(size.h * fit)
    }
    shownPage = pageNumber
    renderer.prefetch(pageNumber + 2, fit * (window.devicePixelRatio || 1))
  }

  /** Lleva el rectangulo de la region a coordenadas de la pantalla. */
  function place () {
    const region = regions[index]
    if (!region) return

    const { fit, size } = scaleFor(region.rect.page)
    const imageW = size.w * fit
    const imageH = size.h * fit
    const left = (stage.clientWidth - imageW) / 2
    const top = (stage.clientHeight - imageH) / 2

    // Si la pagina no cabe, se desplaza para dejar la region a la vista.
    const anchorY = stage.clientHeight * 0.42
    const contentY = imageH <= stage.clientHeight
      ? 0
      : clamp(anchorY - (top + region.rect.y * fit), stage.clientHeight - imageH - top, -top)

    const box = {
      left: left + region.rect.x * fit,
      top: top + region.rect.y * fit + contentY,
      right: left + (region.rect.x + region.rect.w) * fit,
      bottom: top + (region.rect.y + region.rect.h) * fit + contentY
    }

    const pad = Math.max(4, 5 * fit)
    const feather = Math.max(8, 14 * fit)

    stage.style.setProperty('--content-y', `${contentY.toFixed(1)}px`)
    setMask({
      a: box.top - pad - feather,
      b: box.top - pad,
      c: box.bottom + pad,
      d: box.bottom + pad + feather,
      e: box.left - pad - feather,
      f: box.left - pad,
      g: box.right + pad,
      h: box.right + pad + feather
    })
  }

  function setMask (values) {
    for (const [key, value] of Object.entries(values)) {
      sharpLayer.style.setProperty(`--mask-${key}`, `${value.toFixed(1)}px`)
    }
  }

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

  async function goTo (next, { animate = true } = {}) {
    if (!regions.length) return
    index = clamp(next, 0, regions.length - 1)

    const region = regions[index]
    anchor = region.start

    if (region.rect.page !== shownPage) {
      if (!animate) stage.classList.add('is-instant')
      await showPage(region.rect.page)
    }
    place()
    if (!animate) {
      void stage.offsetHeight
      stage.classList.remove('is-instant')
    }

    emitStatus()
    scheduleSave()
  }

  function emitStatus () {
    const region = regions[index]
    onStatus?.({
      chapter: book.chapters[chapterAtOffset(book, anchor)]?.title ?? '',
      percent: percentAt(book, anchor),
      offset: anchor,
      page: (region?.rect.page ?? 0) + 1,
      marked: Boolean(notes?.find(anchor))
    })
  }

  function scheduleSave () {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      if (book) onSave?.(makeProgress(book, anchor))
    }, SAVE_DELAY)
  }

  const regionOfOffset = offset => {
    const target = blockAtOffset(book, offset)
    const found = regions.findIndex(r => r.block >= target)
    return found === -1 ? 0 : found
  }

  return {
    async open (nextBook, progress, notesStore, bytes) {
      book = nextBook
      notes = notesStore
      anchor = progress?.offset ?? startOffset(nextBook)
      shownPage = -1

      await renderer.open(bytes)
      regions = buildRegions(book)
      prepareLayers()
      await goTo(regionOfOffset(anchor), { animate: false })
    },

    close () {
      clearTimeout(saveTimer)
      if (book && regions.length) onSave?.(makeProgress(book, anchor))
      renderer.close()
      contentSharp.replaceChildren()
      contentDim.replaceChildren()
      book = null
      notes = null
      regions = []
    },

    move: delta => goTo(index + delta),
    page: direction => goTo(index + direction * 5),
    jump: where => goTo(where === 'start' ? 0 : regions.length - 1),

    /** En esta vista, avanzar de capitulo es saltar al primero de su bloque. */
    chapter (direction) {
      if (!book) return
      const current = chapterAtOffset(book, anchor)
      const next = book.chapters[current + direction]
      if (next) goTo(regions.findIndex(r => r.block >= next.start))
    },

    goToOffset: offset => goTo(regionOfOffset(offset), { animate: false }),

    currentLine () {
      const region = regions[index]
      if (!region) return null
      const block = book.blocks[region.block]
      return {
        block: region.block,
        char: 0,
        offset: region.start,
        text: block?.text ?? '',
        context: (block?.text ?? '').slice(0, 200) || `Figura en la página ${region.rect.page + 1}`
      }
    },

    /** Al cambiar el tamano de la ventana la pagina se redibuja a su medida. */
    async relayout () {
      if (!book || !regions.length) return
      shownPage = -1
      await goTo(index, { animate: false })
    },

    setFocusShape (settings) {
      const next = settings.pageZoom ?? 1
      if (next === zoom) return
      zoom = next
      this.relayout()
    },

    markBlock: () => {},
    refreshStatus: emitStatus,
    get book () { return book },
    get isOpen () { return book !== null }
  }
}
