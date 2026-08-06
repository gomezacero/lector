// Ficha de un libro: lo que se ve antes de empezar a leerlo.
//
// Aparece solo la primera vez que se abre un PDF. Sirve para dos cosas: saber
// que es ese documento, y decidir como leerlo antes de entrar en vez de tener
// que corregirlo despues. Ensena en que se ha basado la deteccion, porque una
// eleccion se acepta mejor cuando se ve el motivo.

import { h } from '../ui/dom.js'
import { MODES, detectMode } from '../reader/mode.js'

const number = value => new Intl.NumberFormat('es').format(value)

export function createBookSheet ({ onStart, onCancel }) {
  const body = h('div', { class: 'sheet-body' })
  const view = h('section', { class: 'view view-sheet', id: 'view-sheet' },
    h('div', { class: 'sheet' }, body))

  let chosen = null

  function render (book, { entry = null, title = 'Empezar a leer' } = {}) {
    const detected = detectMode(book)
    chosen = entry?.readingMode ?? detected.mode

    // replaceChildren convierte en texto lo que no sea un nodo: un campo
    // omitido escribiria literalmente "null" en la ficha.
    const paint = () => body.replaceChildren(...[
      h('button', {
        class: 'btn btn-ghost sheet-back',
        text: '‹ Biblioteca',
        onclick: onCancel
      }),

      h('h1', { class: 'sheet-title', text: book.title }),
      book.author ? h('p', { class: 'sheet-author', text: book.author }) : null,

      h('dl', { class: 'sheet-facts' },
        fact('Páginas', number(book.pageCount)),
        fact('Palabras', number(book.stats?.words ?? 0)),
        fact('Capítulos', number(book.chapters?.length ?? 0)),
        book.stats?.figures ? fact('Figuras', number(book.stats.figures)) : null
      ),

      h('h2', { class: 'sheet-label', text: 'Cómo quieres leerlo' }),
      h('div', { class: 'sheet-modes' },
        modeCard('flow', chosen === 'flow', () => { chosen = 'flow'; paint() }),
        modeCard('page', chosen === 'page', () => { chosen = 'page'; paint() })
      ),

      h('p', { class: 'sheet-why' },
        h('strong', { text: `Sugerido: ${MODES[detected.mode].label.toLowerCase()}` }),
        ` — ${detected.why}. `,
        detected.figures > 0 || detected.columns > 0
          ? `Figuras en el ${Math.round(detected.figures * 100)} % de las páginas, ` +
            `columnas en el ${Math.round(detected.columns * 100)} %.`
          : 'No se han encontrado ni figuras ni columnas.'
      ),

      h('button', {
        class: 'btn btn-primary sheet-start',
        text: title,
        onclick: () => onStart(chosen)
      })
    ].filter(Boolean))

    paint()
  }

  return { element: view, render }
}

const fact = (label, value) => h('div', { class: 'fact' },
  h('dt', { text: label }),
  h('dd', { text: value })
)

function modeCard (id, active, onPick) {
  const mode = MODES[id]
  return h('button', {
    class: `mode-card${active ? ' is-on' : ''}`,
    onclick: onPick
  },
  h('span', { class: 'mode-card-art' }, art(id)),
  h('span', { class: 'mode-card-name', text: mode.label }),
  h('span', { class: 'mode-card-hint', text: mode.hint })
  )
}

/** Dibujito de cada modo: se entiende antes viendolo que leyendolo. */
function art (id) {
  const line = (width, state) => h('i', { class: `art-line is-${state}`, style: { width } })

  return id === 'flow'
    ? h('span', { class: 'art art-flow' },
        line('90%', 'dim'), line('80%', 'dim'),
        line('95%', 'sharp'),
        line('85%', 'dim'), line('70%', 'dim'))
    : h('span', { class: 'art art-page' },
        h('span', { class: 'art-col' }, line('100%', 'sharp'), line('100%', 'sharp'), line('60%', 'sharp')),
        h('span', { class: 'art-col' }, line('100%', 'dim'), line('100%', 'dim'), line('80%', 'dim')))
}
