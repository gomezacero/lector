// Panel de marcadores y notas. Cada entrada devuelve al punto exacto del libro.

import { h, percent } from '../ui/dom.js'
import { percentAt } from '../reader/progress.js'

export function createNotesView ({ onClose, onGo, onDelete, onEdit, onExport }) {
  const body = h('div', { class: 'panel-body' })

  const panel = h('aside', { class: 'panel' },
    h('div', { class: 'panel-head' },
      h('h2', { text: 'Marcadores y notas' }),
      h('div', { class: 'panel-head-actions' },
        onExport
          ? h('button', {
              class: 'btn btn-ghost panel-export',
              text: 'Exportar',
              title: 'Guardar citas y notas como Markdown',
              onclick: onExport
            })
          : null,
        h('button', { class: 'panel-close', text: '×', title: 'Cerrar', onclick: onClose })
      )
    ),
    body
  )
  // Nace cerrado: fuera del orden de tabulacion hasta que se abra.
  panel.inert = true

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
        body.replaceChildren(h('p', { class: 'notes-empty' },
          'Aún no hay marcadores. Pulsa ', h('kbd', { text: 'M' }),
          ' mientras lees para guardar la línea en la que estás.'
        ))
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
    panel.inert = false
    panel.classList.add('is-open')
  }

  function close () {
    // Cerrar con el foco aun en una nota (Esc, Ctrl+B) no dispara blur por si
    // solo: se fuerza para que lo escrito llegue a onEdit antes de ocultar.
    if (panel.contains(document.activeElement)) document.activeElement.blur()
    // Cerrado no debe recibir el tabulador: el transform solo lo aparta.
    panel.inert = true
    panel.classList.remove('is-open')
  }
}
