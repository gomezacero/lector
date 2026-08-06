import { describe, it, expect } from 'vitest'
import { buildRegions } from '../src/reader/regions.js'

// Un libro a dos columnas de 558x720, como "Fisica Universitaria".
const PAGE = { w: 558, h: 720 }
const LEFT = 100
const RIGHT = 300

const block = (text, { page = 0, x = LEFT, y = 100, w = 180, h = 30, type = 'paragraph', role } = {}) => ({
  type, text, role, page, start: 0, rects: [{ page, x, y, w, h }]
})

const book = (...blocks) => {
  let start = 0
  for (const b of blocks) { b.start = start; start += b.text.length + 1 }
  return {
    blocks,
    chars: start,
    pageSizes: [PAGE, PAGE, PAGE],
    stats: { leading: 14 }
  }
}

const parrafo = 'x'.repeat(400)

describe('buildRegions', () => {
  it('da una parada por bloque cuando son parrafos de verdad', () => {
    const regions = buildRegions(book(
      block(parrafo, { y: 100 }),
      block(parrafo, { y: 200 })
    ))

    expect(regions).toHaveLength(2)
  })

  it('junta los niveles de una ecuacion en una sola parada', () => {
    // Numerador, barra y denominador llegan como tres bloques seguidos.
    const regions = buildRegions(book(
      block(parrafo, { y: 100, h: 40 }),
      block('A 5 cos u', { y: 145, h: 12 }),
      block('A 5 A cos u', { y: 160, h: 12 }),
      block('(1.6)', { y: 175, h: 12 })
    ))

    expect(regions).toHaveLength(1)
    // Y la region abarca desde el parrafo hasta el ultimo nivel.
    expect(regions[0].rect.y).toBe(100)
    expect(regions[0].rect.h).toBe(87)
  })

  it('conserva el offset del primer bloque al juntar', () => {
    const libro = book(
      block(parrafo, { y: 100, h: 40 }),
      block('d 5 vt', { y: 145, h: 12 })
    )
    const regions = buildRegions(libro)

    expect(regions[0].start).toBe(libro.blocks[0].start)
  })

  it('no junta trozos de columnas distintas', () => {
    // Mismo alto, lado a lado: son dos columnas, no una continuacion.
    const regions = buildRegions(book(
      block('d 5 vt', { x: LEFT, y: 100, w: 180, h: 12 }),
      block('F 5 ma', { x: RIGHT, y: 112, w: 180, h: 12 })
    ))

    expect(regions).toHaveLength(2)
  })

  it('no junta dos parrafos largos, que se leen por separado', () => {
    const regions = buildRegions(book(
      block(parrafo, { y: 100, h: 40 }),
      block(parrafo, { y: 145, h: 40 })
    ))

    expect(regions).toHaveLength(2)
  })

  it('no junta a traves de un hueco grande', () => {
    const regions = buildRegions(book(
      block('d 5 vt', { y: 100, h: 12 }),
      block('F 5 ma', { y: 400, h: 12 })
    ))

    expect(regions).toHaveLength(2)
  })

  it('no junta a traves de un salto de pagina', () => {
    const regions = buildRegions(book(
      block('d 5 vt', { page: 0, y: 700, h: 12 }),
      block('F 5 ma', { page: 1, y: 100, h: 12 })
    ))

    expect(regions).toHaveLength(2)
  })

  it('deja la figura como parada propia', () => {
    // Una figura es una unidad de lectura, no una miga que absorber.
    const regions = buildRegions(book(
      block('pie corto', { y: 100, h: 12 }),
      block('', { y: 115, h: 120, type: 'figure' }),
      block('otro pie', { y: 240, h: 12 })
    ))

    expect(regions).toHaveLength(3)
  })

  it('mete el rectangulo dentro de la pagina', () => {
    // Un ajuste optico deja coordenadas por encima del borde y el foco se
    // planta sobre el papel, fuera del texto.
    const regions = buildRegions(book(block(parrafo, { y: -21, h: 60 })))

    expect(regions[0].rect.y).toBe(0)
    expect(regions[0].rect.h).toBe(39)
  })

  it('no deja que una region crezca por media pagina', () => {
    const migas = Array.from({ length: 32 }, (_, i) =>
      block(`nivel ${i}`, { y: 20 + i * 20, h: 12 }))
    const regions = buildRegions(book(...migas))

    expect(regions.length).toBeGreaterThan(1)
    for (const region of regions) {
      expect(region.rect.h).toBeLessThanOrEqual(PAGE.h * 0.45)
    }
  })

  it('ensena la cubierta y el indice de una pieza, una parada por pagina', () => {
    const libro = book(
      block('EL TÚNEL', { page: 0, role: 'cover' }),
      block('ERNESTO SÁBATO', { page: 0, y: 200, role: 'cover' }),
      block('I ....... 7', { page: 1, role: 'toc' }),
      block('II ...... 23', { page: 1, y: 130, role: 'toc' }),
      block(parrafo, { page: 2 })
    )
    libro.pageRoles = ['cover', 'toc', null]
    const regions = buildRegions(libro)

    expect(regions).toHaveLength(3)
    expect(regions[0].rect).toMatchObject({ x: 0, y: 0, w: PAGE.w, h: PAGE.h })
    expect(regions[1].role).toBe('toc')
  })
})
