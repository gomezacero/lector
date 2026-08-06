import { describe, it, expect } from 'vitest'
import { buildChapters } from '../src/pdf/chapters.js'

const block = (text, page, type = 'paragraph') => ({ type, text, page })

describe('buildChapters', () => {
  it('usa el indice del PDF cuando el documento lo declara', () => {
    const blocks = [
      block('portadilla', 0),
      block('Uno', 1, 'heading'), block('texto', 1), block('mas texto', 2),
      block('Dos', 3, 'heading'), block('texto', 3)
    ]
    const outline = [
      { title: 'Capitulo uno', page: 1, depth: 0 },
      { title: 'Capitulo dos', page: 3, depth: 0 }
    ]

    expect(buildChapters(blocks, outline)).toEqual([
      { title: 'Comienzo', start: 0, end: 1 },
      { title: 'Capitulo uno', start: 1, end: 4 },
      { title: 'Capitulo dos', start: 4, end: 6 }
    ])
  })

  it('se queda con el nivel superior del indice e ignora las subsecciones', () => {
    const blocks = [
      block('Uno', 0, 'heading'), block('texto', 0),
      block('1.1', 1, 'heading'), block('texto', 1),
      block('Dos', 2, 'heading'), block('texto', 2)
    ]
    const outline = [
      { title: 'Parte I', page: 0, depth: 0 },
      { title: 'Seccion 1.1', page: 1, depth: 1 },
      { title: 'Parte II', page: 2, depth: 0 }
    ]

    expect(buildChapters(blocks, outline).map(c => c.title)).toEqual(['Parte I', 'Parte II'])
  })

  it('cae en los titulos detectados cuando no hay indice', () => {
    const blocks = [
      block('Primero', 0, 'heading'), block('texto', 0),
      block('Segundo', 1, 'heading'), block('texto', 1)
    ]

    expect(buildChapters(blocks, [])).toEqual([
      { title: 'Primero', start: 0, end: 2 },
      { title: 'Segundo', start: 2, end: 4 }
    ])
  })

  it('trocea el libro cuando no hay ninguna estructura', () => {
    const blocks = Array.from({ length: 250 }, (_, i) => block(`parrafo ${i}`, Math.floor(i / 30)))
    const chapters = buildChapters(blocks, [])

    expect(chapters).toHaveLength(3)
    expect(chapters.map(c => c.start)).toEqual([0, 100, 200])
    expect(chapters.at(-1).end).toBe(250)
  })

  it('cubre todos los bloques sin huecos ni solapes', () => {
    const blocks = [
      block('intro', 0),
      block('Uno', 0, 'heading'), block('a', 0),
      block('Dos', 1, 'heading'), block('b', 1)
    ]
    const chapters = buildChapters(blocks, [])

    expect(chapters[0].start).toBe(0)
    expect(chapters.at(-1).end).toBe(blocks.length)
    for (let i = 1; i < chapters.length; i++) {
      expect(chapters[i].start).toBe(chapters[i - 1].end)
    }
  })

  it('no devuelve nada si no hay bloques', () => {
    expect(buildChapters([], [])).toEqual([])
  })
})
