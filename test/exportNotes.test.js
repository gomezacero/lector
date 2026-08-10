// La exportación de citas y notas a Markdown: lo que uno se lleva del libro.

import { describe, it, expect } from 'vitest'
import { exportNotesMarkdown } from '../src/notes/exportNotes.js'

const book = {
  title: 'La casa de las horas lentas',
  author: 'A. Autora',
  chars: 100,
  blocks: [
    { text: 'a'.repeat(48), start: 0, page: 0 },
    { text: 'b'.repeat(50), start: 49, page: 1 }
  ],
  chapters: [
    { title: 'Uno', start: 0, end: 1 },
    { title: 'Dos', start: 1, end: 2 }
  ]
}

const notes = [
  { id: '1', offset: 3, block: 0, quote: 'Las casas viejas hablan de noche.', text: 'apuntar esto', createdAt: 1 },
  { id: '2', offset: 60, block: 1, quote: 'El notario le había advertido.', text: '', kind: 'highlight', color: 'green', createdAt: 2 }
]

describe('exportNotesMarkdown', () => {
  it('agrupa por capítulo, con la cita y la nota de cada entrada', () => {
    const md = exportNotesMarkdown(book, notes)

    expect(md).toContain('# La casa de las horas lentas')
    expect(md).toContain('A. Autora')
    expect(md).toContain('## Uno')
    expect(md).toContain('## Dos')
    // La cita como blockquote y la nota del lector debajo.
    expect(md).toContain('> Las casas viejas hablan de noche.')
    expect(md).toContain('apuntar esto')
    expect(md).toContain('> El notario le había advertido.')
    // La página, para poder volver al papel.
    expect(md).toContain('p. 1')
    expect(md).toContain('p. 2')
  })

  it('el capítulo aparece una sola vez aunque tenga varias notas', () => {
    const two = [...notes, { id: '3', offset: 5, block: 0, quote: 'Otra cita.', text: '', createdAt: 3 }]
    const md = exportNotesMarkdown(book, two)
    expect(md.match(/## Uno/g)).toHaveLength(1)
  })

  it('sin notas devuelve null: no hay nada que exportar', () => {
    expect(exportNotesMarkdown(book, [])).toBe(null)
  })
})
