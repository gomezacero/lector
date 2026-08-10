// Barra de desplazamiento del libro: un carril fino pegado al borde derecho
// del lector. Ensena de un vistazo por donde va la lectura, marca donde
// empieza cada capitulo y, arrastrando o con un clic, salta a cualquier punto
// —la unica manera rapida de plantarse en mitad de un PDF largo.
//
// El ancla es el offset de caracter, como todo el progreso: funciona igual en
// el texto re-maquetado y sobre la pagina original (donde, en un libro
// provisional, el offset ya ES el indice de pagina).

import { h } from '../ui/dom.js'
import { blockAtOffset, chapterAtOffset } from './progress.js'

export function createScrubber ({ onGo }) {
  let book = null
  let offset = 0
  let dragging = false

  const thumb = h('div', { class: 'scrubber-thumb' })
  const ticks = h('div', { class: 'scrubber-ticks' })
  const bubble = h('div', { class: 'scrubber-bubble', hidden: true })
  const track = h('div', {
    class: 'scrubber',
    role: 'slider',
    'aria-label': 'Posición en el libro',
    'aria-orientation': 'vertical',
    'aria-valuemin': '0',
    'aria-valuemax': '100'
  }, ticks, thumb, bubble)

  const span = () => Math.max(1, (book?.chars ?? 1) - 1)
  const ratioOf = at => Math.max(0, Math.min(1, at / span()))

  function ratioAt (event) {
    const rect = track.getBoundingClientRect()
    return Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))
  }

  function paint () {
    const ratio = ratioOf(offset)
    thumb.style.top = `${(ratio * 100).toFixed(2)}%`
    track.setAttribute('aria-valuenow', String(Math.round(ratio * 100)))
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
    bubble.textContent = describe(Math.round(ratio * span()))
    bubble.style.top = `${(ratio * 100).toFixed(2)}%`
    bubble.hidden = !bubble.textContent
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
    thumb.style.top = `${(ratioAt(event) * 100).toFixed(2)}%`
  })

  track.addEventListener('pointermove', event => {
    if (!book) return
    if (dragging) thumb.style.top = `${(ratioAt(event) * 100).toFixed(2)}%`
    showBubble(event)
  })

  track.addEventListener('pointerup', event => {
    if (!dragging) return
    dragging = false
    track.classList.remove('is-dragging')
    onGo(Math.round(ratioAt(event) * span()))
  })

  track.addEventListener('pointerleave', () => {
    if (!dragging) bubble.hidden = true
  })

  return {
    element: track,

    /** El libro abierto (o null al salir): dibuja las marcas de capitulo. */
    setBook (next) {
      book = next
      track.hidden = !book
      if (!book) return
      ticks.replaceChildren(...book.chapters
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
