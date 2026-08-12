import { describe, it, expect } from 'vitest'
import { toLocator } from '../src/contracts/models.js'
import { assertReaderController, offsetFromLocator } from '../src/reader/readerContract.js'

describe('ReadingLocator', () => {
  it('acepta progreso viejo y conserva las anclas de reubicacion', () => {
    expect(toLocator({ offset: 42.8, context: 'la frase', page: 3, percent: 0.2 }))
      .toEqual({ offset: 42, context: 'la frase', page: 3 })
    expect(offsetFromLocator(9)).toBe(9)
  })

  it('normaliza datos dañados a un inicio seguro', () => {
    expect(toLocator({ offset: -2, page: -1 })).toEqual({ offset: 0 })
    expect(toLocator(null)).toEqual({ offset: 0 })
  })
})

describe('contrato de lector', () => {
  const methods = [
    'open', 'close', 'move', 'page', 'chapter', 'goToLocator',
    'getLocator', 'getCurrentExcerpt', 'subscribe', 'setPresentation',
    'getCapabilities', 'setFocusSettings', 'relayout', 'flush'
  ]

  it('acepta solo controladores que implementan la interfaz comun', () => {
    const reader = Object.fromEntries(methods.map(name => [name, () => {}]))
    expect(assertReaderController(reader)).toBe(reader)
    delete reader.flush
    expect(() => assertReaderController(reader)).toThrow(/flush/)
  })
})
