// Panel de marcadores y notas. Cada entrada devuelve al punto exacto del libro.

import { h, percent } from '../ui/dom.js'
import { percentAt } from '../reader/progress.js'

export function createNotesView ({ onClose, onGo, onDelete, onEdit, onExport }) {
  const body = h('div', { class: 'panel-body' })

  const panel = h('aside', {
    class: 'panel notes-panel', hidden: true, dataset: { panel: 'notes' },
    'aria-label': 'Notas y marcadores'
  },
    h('div', { class: 'panel-head' },
      h('div', { class: 'panel-title' },
        h('span', { class: 'panel-eyebrow', text: 'Tu lectura' }),
        h('h2', { text: 'Notas y marcadores' })),
      h('div', { class: 'panel-head-actions' },
        onExport
          ? h('button', {
              class: 'panel-action panel-export',
              text: 'Exportar',
              title: 'Guardar citas y notas como Markdown',
              onclick: onExport
            })
          : null,
        h('button', {
          class: 'panel-close', text: '×', title: 'Cerrar notas',
          'aria-label': 'Cerrar notas', onclick: onClose
        })
      )
    ),
    body
  )
  // Nace cerrado: fuera del orden de tabulacion hasta que se abra.
  panel.inert = true
  panel.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    onClose?.()
  })

  function noteCard (note, book) {
    const editor = h('textarea', {
      placeholder: 'Escribe una nota…',
      onblur: event => onEdit(note.id, event.target.value.trim()),
      onclick: event => event.stopPropagation()
    })
    // Como propiedad y no como atributo: <textarea> no tiene atributo value,
    // asi que por setAttribute el texto guardado llegaria siempre vacio.
    editor.value = note.text ?? ''

    return h('div', { class: 'note', onclick: () => onGo(note) },
      h('p', { class: 'note-quote', text: `«${note.quote}»` }),
      h('div', { class: 'note-editor', onclick: event => event.stopPropagation() }, editor),
      h('div', { class: 'note-foot' },
        h('span', { class: 'note-foot-where' },
          // El punto de color dice que es un resaltado, y de cual.
          note.kind === 'highlight' ? h('i', { class: `note-color is-${note.color ?? 'yellow'}` }) : null,
          // El mismo porcentaje que el HUD (descuenta los preliminares): dos
          // numeros distintos para el mismo punto solo siembran dudas.
          h('span', { text: percent(percentAt(book, note.offset)) })
        ),
        h('button', {
          class: 'note-del',
          text: 'Eliminar',
          onclick: event => { event.stopPropagation(); onDelete(note.id) }
        })
      )
    )
  }

  return {
    element: panel,

    render (notes, book) {
      if (!notes.length) {
        body.replaceChildren(h('div', { class: 'panel-empty' },
          h('span', { class: 'panel-empty-icon', text: '◇', 'aria-hidden': 'true' }),
          h('h3', { text: 'Aún no has guardado nada' }),
          h('p', { class: 'notes-empty' },
            'Pulsa ', h('kbd', { text: 'M' }),
            ' o el botón Marcar para guardar la línea actual. También puedes seleccionar texto para resaltarlo.'
          )))
        return
      }
      body.replaceChildren(...notes.map(note => noteCard(note, book)))
    },

    open,
    close,
    toggle: () => (panel.classList.contains('is-open') ? close() : open()),
    get isOpen () { return panel.classList.contains('is-open') }
  }

  function open () {
    panel.hidden = false
    panel.inert = false
    panel.classList.add('is-open')
  }

  function close () {
    // Cerrar con el foco aun en una nota (Esc, Ctrl+B) no dispara blur por si
    // solo: se fuerza para que lo escrito llegue a onEdit antes de ocultar.
    if (panel.contains(document.activeElement)) document.activeElement.blur()
    // Cerrado no debe recibir el tabulador: el transform solo lo aparta.
    panel.classList.remove('is-open')
    panel.inert = true
    panel.hidden = true
  }
}
