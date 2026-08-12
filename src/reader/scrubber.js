// Barra de desplazamiento del libro: un carril fino pegado al borde derecho
// del lector. Ensena de un vistazo por donde va la lectura, marca donde
// empieza cada capitulo y, arrastrando o con un clic, salta a cualquier punto
// —la unica manera rapida de plantarse en mitad de un PDF largo.
//
// El ancla es el offset de caracter, como todo el progreso: funciona igual en
// el texto re-maquetado y sobre la pagina original (donde, en un libro
// provisional, el offset ya ES el indice de pagina).

import { h } from '../ui/dom.js'
import { blockAtOffset, chapterAtOffset, readingRange } from './progress.js'

export function createScrubber ({ onGo }) {
  let book = null
  let offset = 0
  let dragging = false

  const fill = h('div', { class: 'scrubber-fill', 'aria-hidden': 'true' })
  const thumb = h('div', { class: 'scrubber-thumb', 'aria-hidden': 'true' })
  const ticks = h('div', { class: 'scrubber-ticks' })
  const bubble = h('div', { class: 'scrubber-bubble', hidden: true })
  const track = h('div', {
    class: 'scrubber',
    role: 'slider',
    tabindex: '0',
    'aria-label': 'Posición en el libro',
    'aria-orientation': 'vertical',
    'aria-valuemin': '0',
    'aria-valuemax': '100',
    title: 'Explorar el libro'
  }, fill, ticks, thumb, bubble)

  const range = () => book ? readingRange(book) : { from: 0, to: 1 }
  const span = () => Math.max(1, range().to - range().from)
  const ratioOf = at => Math.max(0, Math.min(1, (at - range().from) / span()))
  const offsetAt = ratio => Math.round(range().from + ratio * span())

  function ratioAt (event) {
    const rect = track.getBoundingClientRect()
    return Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))
  }

  function paint () {
    const ratio = ratioOf(offset)
    preview(ratio)
    track.setAttribute('aria-valuenow', String(Math.round(ratio * 100)))
    track.setAttribute('aria-valuetext', `${Math.round(ratio * 100)}% · ${describe(offset)}`)
    if (document.activeElement === track) showCurrentBubble()
  }

  function preview (ratio) {
    thumb.style.top = `${(ratio * 100).toFixed(2)}%`
    fill.style.height = `${(ratio * 100).toFixed(2)}%`
  }

  /** "p. 12 · Capítulo tal": lo justo para saber a donde se salta. */
  function describe (at) {
    if (!book) return ''
    const page = book.blocks.length
      ? (book.blocks[blockAtOffset(book, at)]?.page ?? 0) + 1
      : at + 1
    const chapter = book.chapters[chapterAtOffset(book, at)]?.title
    return chapter ? `p. ${page} · ${chapter}` : `p. ${page}`
  }

  function showBubble (event) {
    const ratio = ratioAt(event)
    bubble.textContent = `${Math.round(ratio * 100)}% · ${describe(offsetAt(ratio))}`
    bubble.style.top = `${(ratio * 100).toFixed(2)}%`
    bubble.hidden = !bubble.textContent
  }

  function showCurrentBubble () {
    const ratio = ratioOf(offset)
    bubble.textContent = `${Math.round(ratio * 100)}% · ${describe(offset)}`
    bubble.style.top = `${(ratio * 100).toFixed(2)}%`
    bubble.hidden = !book
  }

  track.addEventListener('pointerdown', event => {
    if (!book) return
    dragging = true
    // Los eventos sinteticos del arnes de desarrollo no traen puntero activo.
    try { track.setPointerCapture(event.pointerId) } catch {}
    track.classList.add('is-dragging')
    showBubble(event)
    // El salto de verdad se hace al soltar: en el flujo cada salto re-maqueta
    // un capitulo, y hacerlo en cada pixel del arrastre seria un traqueteo.
    preview(ratioAt(event))
  })

  track.addEventListener('pointermove', event => {
    if (!book) return
    if (dragging) preview(ratioAt(event))
    showBubble(event)
  })

  track.addEventListener('pointerup', event => {
    if (!dragging) return
    dragging = false
    track.classList.remove('is-dragging')
    onGo(offsetAt(ratioAt(event)))
  })

  track.addEventListener('pointerleave', () => {
    if (!dragging) bubble.hidden = true
  })

  track.addEventListener('pointercancel', () => {
    dragging = false
    track.classList.remove('is-dragging')
    bubble.hidden = true
    paint()
  })

  track.addEventListener('focus', showCurrentBubble)
  track.addEventListener('blur', () => { if (!dragging) bubble.hidden = true })
  track.addEventListener('keydown', event => {
    if (!book) return
    const ratio = ratioOf(offset)
    const step = event.key === 'PageDown' || event.key === 'PageUp' ? 0.1 : 0.02
    let next = null
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight' || event.key === 'PageDown') next = ratio + step
    if (event.key === 'ArrowUp' || event.key === 'ArrowLeft' || event.key === 'PageUp') next = ratio - step
    if (event.key === 'Home') next = 0
    if (event.key === 'End') next = 1
    if (next == null) return
    event.preventDefault()
    onGo(offsetAt(Math.max(0, Math.min(1, next))))
  })

  return {
    element: track,

    /** El libro abierto (o null al salir): dibuja las marcas de capitulo. */
    setBook (next) {
      book = next
      track.hidden = !book
      if (!book) return
      ticks.replaceChildren(...book.chapters
        .filter(chapter => !chapter.kind)
        .map(chapter => book.blocks[chapter.start]?.start)
        .filter(at => at != null && at > 0)
        .map(at => h('i', { style: { top: `${(ratioOf(at) * 100).toFixed(2)}%` } })))
      paint()
    },

    /** El punto de lectura, cada vez que el lector lo mueve. */
    setOffset (next) {
      offset = next
      if (!dragging) paint()
    }
  }
}
