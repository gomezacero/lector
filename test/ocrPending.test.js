// La decision de que hacer con el OCR guardado al abrir un libro.
//
// El caso que motivo estas funciones: una pagina escaneada cuyo reconocimiento
// quedo vacio (una lamina, una pagina en blanco) se queda como 'scanned' para
// siempre; si eso contara como "OCR pendiente", el libro se reprocesaria
// entero en cada apertura.

import { describe, it, expect } from 'vitest'
import { hasUnappliedOcr, unattemptedPages } from '../src/ocr/pending.js'

const items = n => ({ items: Array.from({ length: n }, () => ({})), confidence: 80 })

describe('hasUnappliedOcr', () => {
  it('detecta texto reconocido que el cache aún no incorpora', () => {
    expect(hasUnappliedOcr(['text', 'scanned'], { 1: items(3) })).toBe(true)
  })

  it('ignora las páginas cuyo reconocimiento quedó vacío', () => {
    expect(hasUnappliedOcr(['text', 'scanned'], { 1: items(0) })).toBe(false)
  })

  it('sin OCR guardado no hay nada pendiente', () => {
    expect(hasUnappliedOcr(['scanned', 'scanned'], undefined)).toBe(false)
    expect(hasUnappliedOcr(undefined, { 0: items(2) })).toBe(false)
  })

  it('una página ya incorporada (kind ocr) no cuenta', () => {
    expect(hasUnappliedOcr(['ocr', 'text'], { 0: items(3) })).toBe(false)
  })
})

describe('unattemptedPages', () => {
  it('lista las escaneadas sin intento de reconocimiento', () => {
    expect(unattemptedPages(['text', 'scanned', 'scanned'], { 1: items(0) })).toEqual([2])
  })

  it('queda vacía cuando todas se intentaron, aunque no dieran texto', () => {
    expect(unattemptedPages(['scanned', 'scanned'], { 0: items(0), 1: items(2) })).toEqual([])
  })

  it('sin OCR guardado, todas las escaneadas están por intentar', () => {
    expect(unattemptedPages(['scanned', 'text', 'scanned'], undefined)).toEqual([0, 2])
  })
})
