import { describe, it, expect } from 'vitest'
import { clipBox } from '../src/reader/figureClips.js'

const PAGE = { w: 612, h: 792 }

describe('clipBox', () => {
  it('escala el rectangulo y le da un poco de aire', () => {
    const box = clipBox({ x: 100, y: 200, w: 300, h: 150 }, PAGE, 2, 4)

    expect(box).toEqual({ sx: 192, sy: 392, sw: 616, sh: 316 })
  })

  it('no se sale de la pagina por ningun lado', () => {
    // Rects reales con coordenadas negativas: "Fisica Universitaria" trae
    // figuras que arrancan por encima del borde.
    const box = clipBox({ x: -10, y: -21, w: 640, h: 900 }, PAGE, 2, 4)

    expect(box.sx).toBe(0)
    expect(box.sy).toBe(0)
    expect(box.sw).toBe(PAGE.w * 2)
    expect(box.sh).toBe(PAGE.h * 2)
  })

  it('un rect degenerado da un recorte vacio, no uno negativo', () => {
    const box = clipBox({ x: 700, y: 100, w: 50, h: 50 }, PAGE, 2, 4)

    expect(box.sw).toBe(0)
    expect(box.sh).toBeGreaterThan(0)
  })
})
