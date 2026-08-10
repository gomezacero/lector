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
import { chapterAtOffset, percentAt, makeProgress, startOffset } from './progress.js'
import { buildRegions, splitStops } from './regions.js'

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
  let layouts = null // cajas del modelo de layout, si este libro las tiene
  // Renglones por parada, o null para detenerse por parrafos (partiendo solo
  // los desmesurados). Lo fija el ajuste "Parada" con "Lineas en foco".
  let stopLines = null

  const buildStops = () => splitStops(book, buildRegions(book, layouts), stopLines)


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
    // Una parada de pagina entera llena la pantalla y sus bordes nitidos
    // caerian fuera, donde nadie los ve: se recortan al borde. Asi la banda
    // de foco queda siempre dentro de la pantalla, que es el invariante que
    // mide la tarea de desarrollo.
    setMask({
      a: box.top - pad - feather,
      b: Math.max(0, box.top - pad),
      c: Math.min(stage.clientHeight, box.bottom + pad),
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
    const chapterIndex = chapterAtOffset(book, anchor)
    onStatus?.({
      chapter: book.chapters[chapterIndex]?.title ?? '',
      chapterIndex,
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

  // La ultima region que empieza en el offset o antes. Se recorre la lista
  // entera sin atajos: en una pagina analizada por el modelo el orden de
  // lectura visual puede no ser monotono en offsets (una fotografia hereda el
  // ancla de la parada anterior) y cortar en el primer salto elegiria mal.
  const regionOfOffset = offset => {
    let found = 0
    for (let i = 0; i < regions.length; i++) {
      if (regions[i].start <= offset) found = i
    }
    return found
  }

  return {
    async open (nextBook, progress, notesStore, bytes) {
      book = nextBook
      notes = notesStore
      anchor = progress?.offset ?? startOffset(nextBook)
      shownPage = -1

      await renderer.open(bytes)
      regions = buildStops()
      prepareLayers()
      await goTo(regionOfOffset(anchor), { animate: false })
    },

    /** Cajas del modelo de layout para este libro; antes de open. */
    setLayouts (next) { layouts = next },

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

    /** AvPag/RePag pasan la hoja: a la primera parada de la pagina vecina. */
    page (direction) {
      const current = regions[index]?.rect.page
      if (current == null) return
      if (direction > 0) {
        const next = regions.findIndex(r => r.rect.page > current)
        return goTo(next === -1 ? regions.length - 1 : next)
      }
      let previous = -1
      for (const region of regions) {
        if (region.rect.page < current) previous = Math.max(previous, region.rect.page)
      }
      if (previous === -1) return goTo(0)
      return goTo(regions.findIndex(r => r.rect.page === previous))
    },

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
      // En un tramo de parrafo partido, la cita empieza donde empieza el
      // tramo, no siempre al principio del bloque.
      const char = Math.max(0, region.start - (block?.start ?? 0))
      return {
        block: region.block,
        char,
        offset: region.start,
        text: block?.text ?? '',
        context: (block?.text ?? '').slice(char, char + 200).trim() || (region.type === 'page'
          ? `Página ${region.rect.page + 1}`
          : `Figura en la página ${region.rect.page + 1}`)
      }
    },

    /** Al cambiar el tamano de la ventana la pagina se redibuja a su medida. */
    async relayout () {
      if (!book || !regions.length) return
      shownPage = -1
      await goTo(index, { animate: false })
    },

    setFocusShape (settings) {
      // Parada por lineas: "Lineas en foco" dice cuantos renglones abarca
      // cada tramo. Cambiarlo rehace las paradas sin perder el punto.
      const nextStop = settings.pageStop === 'lines'
        ? Math.max(1, settings.focusLines ?? 1)
        : null
      if (nextStop !== stopLines) {
        stopLines = nextStop
        if (book) {
          regions = buildStops()
          void goTo(regionOfOffset(anchor), { animate: false })
        }
      }

      const next = settings.pageZoom ?? 1
      if (next === zoom) return
      zoom = next
      this.relayout()
    },

    markBlock: () => {},
    refreshHighlights: () => {},
    refreshStatus: emitStatus,
    get book () { return book },
    get isOpen () { return book !== null }
  }
}
