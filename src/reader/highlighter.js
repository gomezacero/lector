// Seleccionar texto en el lector ofrece resaltarlo: un pequeño selector de
// color aparece junto a la seleccion. Solo funciona sobre el texto
// re-maquetado (la vista de pagina es una imagen y alli no hay seleccion).

import { h } from '../ui/dom.js'

const COLORS = [
  { id: 'yellow', label: 'amarillo' },
  { id: 'green', label: 'verde' },
  { id: 'blue', label: 'azul' }
]

/**
 * @param {Object} wiring
 * @param {HTMLElement} wiring.container donde vive el selector (posicion relativa)
 * @param {HTMLElement} wiring.content la capa nitida con los bloques
 * @param {Function} wiring.onHighlight ({startBlock, startChar, endBlock, endChar, quote, color})
 * @param {Function=} wiring.onLookup ({word,rect})
 */
export function attachHighlighter ({ container, content, onHighlight, onLookup }) {
  let pending = null

  const pop = h('div', { class: 'hl-pop', hidden: true, role: 'toolbar', 'aria-label': 'Acciones de selección' },
    COLORS.map(color => h('button', {
      class: `hl-dot is-${color.id}`,
      title: `Resaltar en ${color.label}`,
      'aria-label': `Resaltar en ${color.label}`,
      onclick: () => pick(color.id)
    })),
    h('button', { class: 'hl-define', text: 'Definir', onclick: () => lookup() })
  )
  container.append(pop)

  /** Bloque y caracter de un extremo de la seleccion, o null si no es texto. */
  function pointOf (node, offset) {
    if (node?.nodeType !== Node.TEXT_NODE) return null
    const el = node.parentElement?.closest('[data-block]')
    if (!el || !content.contains(el)) return null
    return { block: Number(el.dataset.block), char: offset }
  }

  function hide () {
    pop.hidden = true
    pending = null
  }

  function onMouseUp () {
    // La seleccion se consolida justo despues del mouseup.
    setTimeout(() => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return hide()

      const range = sel.getRangeAt(0)
      const start = pointOf(range.startContainer, range.startOffset)
      const end = pointOf(range.endContainer, range.endOffset)
      if (!start || !end) return hide()

      pending = {
        startBlock: start.block,
        startChar: start.char,
        endBlock: end.block,
        endChar: end.char,
        quote: sel.toString()
      }

      const box = range.getBoundingClientRect()
      const host = container.getBoundingClientRect()
      pop.hidden = false
      const left = Math.max(8, Math.min(box.left + box.width / 2 - host.left - pop.offsetWidth / 2,
        host.width - pop.offsetWidth - 8))
      pop.style.left = `${left.toFixed(0)}px`
      pop.style.top = `${Math.max(8, box.top - host.top - pop.offsetHeight - 10).toFixed(0)}px`
    }, 0)
  }

  function pick (color) {
    if (!pending) return hide()
    onHighlight({ ...pending, color })
    window.getSelection()?.removeAllRanges()
    hide()
  }

  function lookup () {
    if (!pending) return hide()
    const word = pending.quote.trim()
    const rect = pop.getBoundingClientRect()
    hide()
    if (/^[\p{L}'’-]{1,200}$/u.test(word)) onLookup?.({ word, rect })
  }

  content.addEventListener('dblclick', () => {
    setTimeout(() => {
      const selection = window.getSelection()
      const word = selection?.toString().trim() ?? ''
      if (!/^[\p{L}'’-]{1,200}$/u.test(word) || !selection.rangeCount) return
      const rect = selection.getRangeAt(0).getBoundingClientRect()
      hide()
      onLookup?.({ word, rect })
    }, 0)
  })

  document.addEventListener('mouseup', onMouseUp)
  document.addEventListener('mousedown', event => {
    if (!pop.hidden && !pop.contains(event.target)) hide()
  })

  return { hide }
}
