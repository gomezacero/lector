// Fusion de trazados en figuras. La parte delicada es el coste: una grafica
// vectorial densa trae miles de trazos y la fusion fina es cuadratica por
// pasada; coarsen los reduce antes por rejilla para que la ingesta no se
// cuelgue con un libro tecnico.

import { describe, it, expect } from 'vitest'
import { mergeDrawings, coarsen } from '../src/pdf/graphics.js'

const box = (x, y, w = 10, h = 10) => ({ x, y, w, h, image: false })

describe('mergeDrawings', () => {
  it('funde los trazos que se tocan y cuenta las partes', () => {
    const merged = mergeDrawings([box(0, 0), box(8, 8), box(14, 2)])
    expect(merged).toHaveLength(1)
    expect(merged[0].parts).toBe(3)
    expect(merged[0]).toMatchObject({ x: 0, y: 0, w: 24, h: 18 })
  })

  it('mantiene separadas las figuras lejanas', () => {
    const merged = mergeDrawings([box(0, 0), box(300, 300)])
    expect(merged).toHaveLength(2)
  })

  it('aparta los trazos que cubren casi toda la página antes de fundir', () => {
    const frame = box(0, 0, 100, 100) // el marco de la pagina
    const figure = box(20, 20, 10, 10)
    const merged = mergeDrawings([frame, figure], 10, 100 * 100)
    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({ x: 20, y: 20 })
  })

  it('termina en tiempo razonable con miles de trazos', () => {
    // Una nube densa donde todo acaba tocandose: el peor caso de la fusion.
    const drawings = Array.from({ length: 4000 }, (_, i) =>
      box((i % 80) * 7, Math.floor(i / 80) * 7, 8, 8))
    const started = performance.now()
    const merged = mergeDrawings(drawings)
    expect(performance.now() - started).toBeLessThan(2000)
    expect(merged.length).toBeGreaterThan(0)
    // El total de partes se conserva: nada se pierde al reducir.
    expect(merged.reduce((sum, b) => sum + b.parts, 0)).toBe(4000)
  })
})

describe('coarsen', () => {
  it('une las cajas que caen en la misma celda de la rejilla', () => {
    const reduced = coarsen([
      { ...box(1, 1, 4, 4), parts: 1 },
      { ...box(6, 6, 4, 4), parts: 1 },
      { ...box(200, 200, 4, 4), parts: 1 }
    ], 50)

    expect(reduced).toHaveLength(2)
    const together = reduced.find(b => b.x === 1)
    expect(together.parts).toBe(2)
    expect(together).toMatchObject({ x: 1, y: 1, w: 9, h: 9 })
  })

  it('conserva la marca de imagen al unir', () => {
    const reduced = coarsen([
      { ...box(1, 1), parts: 1 },
      { ...box(2, 2), parts: 1, image: true }
    ], 50)
    expect(reduced).toHaveLength(1)
    expect(reduced[0].image).toBe(true)
  })
})
