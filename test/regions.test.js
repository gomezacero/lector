import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildRegions } from '../src/reader/regions.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const fuPath = path.join(here, 'fixtures', 'ingest-Fisica-Universitaria-Sears-Zemansky-12ava-Edicion-Vol1.json')
const layoutPath = path.join(here, 'fixtures', 'layout-detections.json')

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

  it('un escaneado sin bloques da una parada de pagina entera por pagina', () => {
    const libro = {
      blocks: [],
      chars: 3,
      pageCount: 3,
      pageSizes: [PAGE, PAGE, PAGE],
      pageKinds: ['scanned', 'scanned', 'scanned'],
      provisional: true,
      stats: { leading: 14 }
    }
    const regions = buildRegions(libro)

    expect(regions).toHaveLength(3)
    regions.forEach((region, i) => {
      // El offset provisional es el indice de pagina: asi el progreso y el
      // porcentaje funcionan sin un solo caracter de texto.
      expect(region.start).toBe(i)
      expect(region.rect).toMatchObject({ page: i, x: 0, y: 0, w: PAGE.w, h: PAGE.h })
    })
  })

  it('en un escaneado tambien la pagina en blanco conserva su parada', () => {
    // Quitarla descabalaria el hojeo: la pagina 2 pasaria a ser la tercera.
    const libro = {
      blocks: [],
      chars: 3,
      pageCount: 3,
      pageSizes: [PAGE, PAGE, PAGE],
      pageKinds: ['scanned', 'empty', 'scanned'],
      provisional: true,
      stats: { leading: 14 }
    }

    expect(buildRegions(libro)).toHaveLength(3)
  })

  it('intercala la pagina escaneada de un libro mixto donde toca', () => {
    const libro = book(
      block(parrafo, { page: 0 }),
      block(parrafo, { page: 2 })
    )
    libro.pageCount = 3
    libro.pageKinds = ['text', 'scanned', 'text']
    const regions = buildRegions(libro)

    expect(regions).toHaveLength(3)
    expect(regions[1].rect).toMatchObject({ page: 1, x: 0, y: 0 })
    // La parada sintetica hereda el offset del ultimo bloque anterior: el
    // progreso guardado ahi sigue cayendo en un sitio con sentido.
    expect(regions[1].start).toBe(libro.blocks[0].start)
    // Y los offsets de la lista nunca retroceden.
    for (let i = 1; i < regions.length; i++) {
      expect(regions[i].start).toBeGreaterThanOrEqual(regions[i - 1].start)
    }
  })

  it('en un libro con texto la pagina en blanco se sigue saltando', () => {
    const libro = book(
      block(parrafo, { page: 0 }),
      block(parrafo, { page: 2 })
    )
    libro.pageCount = 3
    libro.pageKinds = ['text', 'empty', 'text']

    expect(buildRegions(libro)).toHaveLength(2)
  })

  it('una pagina analizada por el modelo cambia sus paradas por las cajas', () => {
    const libro = book(
      block(parrafo, { page: 0 }),
      block('Un título', { page: 1, y: 40 }),
      block(parrafo, { page: 1, y: 100 }),
      block(parrafo, { page: 2 })
    )
    libro.pageCount = 3
    const layouts = {
      pages: {
        1: [
          { label: 'title', score: 0.9, x: 90, y: 30, w: 200, h: 30 },
          { label: 'picture', score: 0.9, x: 90, y: 300, w: 200, h: 150 },
          { label: 'text', score: 0.9, x: 95, y: 95, w: 190, h: 40 }
        ]
      }
    }
    const regions = buildRegions(libro, layouts)
    const enPagina = regions.filter(r => r.rect.page === 1)

    expect(enPagina.map(r => r.type)).toEqual(['title', 'text', 'picture'])
    // Cada caja ancla en el bloque que cubre; la foto, sin texto debajo,
    // hereda el ancla de la parada anterior.
    expect(enPagina[0].start).toBe(libro.blocks[1].start)
    expect(enPagina[1].start).toBe(libro.blocks[2].start)
    expect(enPagina[2].start).toBe(libro.blocks[2].start)
    // Y las paginas de alrededor siguen como siempre.
    expect(regions.filter(r => r.rect.page === 0)).toHaveLength(1)
    expect(regions.filter(r => r.rect.page === 2)).toHaveLength(1)
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

// Con el libro real y las detecciones reales del modelo, capturadas por las
// tareas `ingest` y `layout`. Si faltan, estos tests se saltan.
describe.skipIf(!existsSync(fuPath) || !existsSync(layoutPath))('cajas reales sobre Fisica Universitaria', () => {
  const load = file => JSON.parse(readFileSync(file, 'utf8'))
  const fu = existsSync(fuPath) ? load(fuPath) : null
  const detections = existsSync(layoutPath) ? load(layoutPath) : []
  // La portadilla del capitulo 1: pagina 24 del PDF, indice 23.
  const layouts = { pages: { 23: detections.find(r => r.page === 24)?.detections ?? [] } }

  it('la portadilla pasa de pagina entera a paradas semanticas en orden', () => {
    const sinModelo = buildRegions(fu).filter(r => r.rect.page === 23)
    expect(sinModelo).toHaveLength(1)
    expect(sinModelo[0].role).toBe('opener')

    const conModelo = buildRegions(fu, layouts).filter(r => r.rect.page === 23)
    expect(conModelo.length).toBeGreaterThan(8)
    // Arranca por el titulo del capitulo, no por el numero ni por la foto.
    expect(conModelo[0].type).toBe('section-header')
    expect(conModelo[0].rect.y).toBeLessThan(60)
    // Toda parada lleva su ancla de progreso.
    for (const region of conModelo) {
      expect(Number.isFinite(region.start)).toBe(true)
    }
  })

  it('las paradas del resto del libro no se mueven', () => {
    const antes = buildRegions(fu)
    const despues = buildRegions(fu, layouts)

    expect(despues.filter(r => r.rect.page !== 23).length)
      .toBe(antes.filter(r => r.rect.page !== 23).length)
  })
})
