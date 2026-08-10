import { describe, it, expect } from 'vitest'
import { fitBox, decodeDetections, LABELS, INPUT_SIZE } from '../src/layout/decode.js'

describe('fitBox', () => {
  it('escala por el lado mayor y deja el resto para el relleno', () => {
    // Una pagina carta dibujada a 2x: 1224x1584, manda el alto.
    const fit = fitBox(1224, 1584)

    expect(fit.scale).toBeCloseTo(INPUT_SIZE / 1584, 5)
    expect(fit.h).toBe(INPUT_SIZE)
    expect(fit.w).toBeLessThan(INPUT_SIZE)
  })
})

describe('decodeDetections', () => {
  const fit = fitBox(1116, 1440) // 558x720 a 2x, como "Fisica Universitaria"

  const row = (x1, y1, x2, y2, score, cls) => [x1, y1, x2, y2, score, cls]

  it('devuelve las cajas en puntos de PDF, no del cuadrado del modelo', () => {
    // Una caja que ocupa el cuadrado entero es la pagina entera.
    const [d] = decodeDetections(row(0, 0, fit.w, fit.h, 0.9, 8), fit, 2)

    expect(d.label).toBe('table')
    expect(d.x).toBe(0)
    expect(d.y).toBe(0)
    expect(d.w).toBeCloseTo(558, 0)
    expect(d.h).toBeCloseTo(720, 0)
  })

  it('descarta lo que no llega a la confianza minima', () => {
    const output = [
      ...row(10, 10, 100, 50, 0.9, 9),
      ...row(10, 60, 100, 90, 0.1, 9)
    ]

    expect(decodeDetections(output, fit, 2)).toHaveLength(1)
  })

  it('ordena de arriba a abajo, que es como se leen', () => {
    const output = [
      ...row(10, 300, 100, 340, 0.8, 9),
      ...row(10, 20, 100, 60, 0.8, 10)
    ]
    const labels = decodeDetections(output, fit, 2).map(d => d.label)

    expect(labels).toEqual(['title', 'text'])
  })

  it('ignora una clase fuera de la tabla, venga de donde venga', () => {
    expect(decodeDetections(row(0, 0, 50, 50, 0.9, 99), fit, 2)).toEqual([])
    expect(LABELS).toHaveLength(11)
  })
})
