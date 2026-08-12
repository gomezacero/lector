import { describe, it, expect } from 'vitest'
import { createBookSearchIndex, createBookSearchTask, normalizeWithMap } from '../src/search/bookSearch.js'

const book = {
  chars: 80,
  bodyStart: 0,
  blocks: [
    { start: 0, page: 0, text: 'Álvaro abrió el libro. Álvaro leyó.' },
    { start: 40, page: 1, text: 'Otra página de la novela.' }
  ],
  chapters: [{ title: 'Uno', start: 0, end: 2 }]
}

describe('RX-SRCH-002 indice local', () => {
  it('ignora tildes y conserva el offset original', () => {
    const index = createBookSearchIndex(book)
    const results = index.search('alvaro')
    expect(results).toHaveLength(2)
    expect(results.map(result => result.locator.offset)).toEqual([0, 23])
    expect(results[0]).toMatchObject({ chapter: 0, page: 0 })
  })

  it('rechaza consultas cortas, limita resultados y puede cancelarse', () => {
    const index = createBookSearchIndex(book)
    expect(index.search('a')).toEqual([])
    expect(index.search('álvaro', 1)).toHaveLength(1)
    index.cancel()
    expect(index.search('libro')).toEqual([])
  })

  it('mapea caracteres que se descomponen en Unicode', () => {
    expect(normalizeWithMap('él').normalized).toBe('el')
    expect(normalizeWithMap('él').map).toEqual([0, 1, 2])
  })

  it('RX-SRCH-005 permite cancelar la construccion cooperativa', async () => {
    const blocks = Array.from({ length: 250 }, (_, index) => ({ start: index * 10, page: 0, text: 'texto largo' }))
    const ready = []
    const task = createBookSearchTask({ blocks }, index => ready.push(index))
    const running = task.start()
    task.cancel()
    await running
    expect(ready).toEqual([])
  })
})
