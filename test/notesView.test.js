// @vitest-environment jsdom
// El panel de notas: que el texto guardado se vea y no se pierda al cerrar.

import { describe, it, expect, vi } from 'vitest'
import { createNotesView } from '../src/notes/notesView.js'

const book = { chars: 1000 }
const note = (over = {}) => ({ id: 'n1', offset: 100, quote: 'una cita', text: 'idea importante', ...over })

const makeView = (over = {}) =>
  createNotesView({ onClose () {}, onGo () {}, onDelete () {}, onEdit () {}, ...over })

describe('notesView', () => {
  it('muestra el texto guardado de la nota', () => {
    const view = makeView()
    view.render([note()], book)

    const editor = view.element.querySelector('textarea')
    expect(editor.value).toBe('idea importante')
  })

  it('no borra el texto al enfocar y desenfocar sin cambios', () => {
    const onEdit = vi.fn()
    const view = makeView({ onEdit })
    document.body.append(view.element)
    view.render([note()], book)

    const editor = view.element.querySelector('textarea')
    editor.focus()
    editor.blur()

    expect(onEdit).toHaveBeenCalledWith('n1', 'idea importante')
    document.body.removeChild(view.element)
  })

  it('guarda lo escrito al cerrar el panel con el foco aún dentro', () => {
    const onEdit = vi.fn()
    const view = makeView({ onEdit })
    document.body.append(view.element)
    view.render([note({ text: '' })], book)
    view.open()

    const editor = view.element.querySelector('textarea')
    editor.focus()
    editor.value = 'escrito sin desenfocar'
    view.close()

    expect(onEdit).toHaveBeenCalledWith('n1', 'escrito sin desenfocar')
    document.body.removeChild(view.element)
  })
})
