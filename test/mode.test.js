// La regla que decide con que vista se abre cada libro. Tres umbrales y un
// caso especial (provisional); si se mueven, cambia la primera impresion de
// todos los libros de la biblioteca.

import { describe, it, expect } from 'vitest'
import { detectMode, resolveMode, isFlowMode } from '../src/reader/mode.js'

const book = (stats, pageCount = 100) => ({ pageCount, stats })

describe('detectMode', () => {
  it('la prosa corriente se lee re-maquetada', () => {
    const { mode, why } = detectMode(book({ figures: 5, columnPages: 0, scannedPages: 0 }))
    expect(mode).toBe('flow')
    expect(why).toContain('texto corrido')
  })

  it('con mayoría de páginas escaneadas manda la página original', () => {
    const { mode, why } = detectMode(book({ scannedPages: 60 }))
    expect(mode).toBe('page')
    expect(why).toContain('escaneadas')
  })

  it('el texto en columnas pide la página original', () => {
    const { mode } = detectMode(book({ columnPages: 40 }))
    expect(mode).toBe('page')
  })

  it('un libro con figuras por todas partes pide la página original', () => {
    const { mode } = detectMode(book({ figures: 20 }))
    expect(mode).toBe('page')
  })

  it('las señales justo en el umbral no disparan el cambio', () => {
    expect(detectMode(book({ scannedPages: 50 })).mode).toBe('flow')
    expect(detectMode(book({ columnPages: 30 })).mode).toBe('flow')
    expect(detectMode(book({ figures: 15 })).mode).toBe('flow')
  })
})

describe('resolveMode', () => {
  it('respeta la elección del lector', () => {
    expect(resolveMode(book({ figures: 20 }), 'flow')).toBe('flow')
    expect(resolveMode(book({}), 'page')).toBe('page')
  })

  it('con "auto" decide la detección', () => {
    expect(resolveMode(book({ scannedPages: 90 }), 'auto')).toBe('page')
    expect(resolveMode(book({}), 'auto')).toBe('flow')
  })

  it('un libro provisional solo tiene vista de página, elija lo que elija', () => {
    expect(resolveMode({ provisional: true, pageCount: 6 }, 'flow')).toBe('page')
  })
})

describe('isFlowMode', () => {
  it('línea a línea y frase a frase comparten lector', () => {
    expect(isFlowMode('flow')).toBe(true)
    expect(isFlowMode('sentence')).toBe(true)
    expect(isFlowMode('page')).toBe(false)
  })
})
