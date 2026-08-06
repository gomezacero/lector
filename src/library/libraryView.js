// La estanteria: lo que se ve al abrir la aplicacion.

import { h, percent } from '../ui/dom.js'

export function createLibraryView ({ grid, empty, onOpen, onRemove }) {
  function card (entry) {
    const progress = entry.progress?.percent ?? 0

    const el = h('div', {
      class: 'book-card',
      role: 'button',
      tabindex: '0',
      title: entry.path,
      onclick: () => onOpen(entry),
      onkeydown: event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen(entry)
        }
      }
    },
    h('p', { class: 'book-card-title', text: entry.title }),
    h('p', { class: 'book-card-author', text: entry.author || '—' }),
    h('div', { class: 'book-card-meta' },
      h('span', {
        class: entry.missing ? 'book-card-missing' : '',
        text: entry.missing ? 'archivo no encontrado' : (progress > 0 ? `${percent(progress)} leído` : 'sin empezar')
      }),
      h('span', { text: `${entry.pageCount} pág.` })
    ),
    h('div', { class: 'book-card-bar' }, h('i', { style: { '--p': String(progress) } })),
    h('button', {
      class: 'book-card-remove',
      title: 'Quitar de la biblioteca',
      text: '×',
      onclick: event => {
        event.stopPropagation()
        onRemove(entry)
      }
    }))

    return el
  }

  return {
    render (entries) {
      // Lo ultimo abierto, primero: es lo que se suele querer retomar.
      const sorted = [...entries].sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0))
      grid.replaceChildren(...sorted.map(card))
      empty.hidden = sorted.length > 0
    }
  }
}
