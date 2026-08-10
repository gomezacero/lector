// Particion de las paradas de la vista de pagina.
//
// El caso que lo motivo: en "La tregua" cada entrada del diario es UN parrafo
// que ocupa la pagina entera, y la parada iluminaba toda la hoja — la guia no
// guiaba nada. Los tramos se alinean al interlineado, asi cada banda cae
// sobre renglones enteros aunque el bloque no guarde sus rectangulos.

import { describe, it, expect } from 'vitest'
import { splitStops } from '../src/reader/regions.js'

const book = {
  pageSizes: [{ w: 612, h: 792 }],
  stats: { leading: 14 },
  blocks: []
}

const tall = (over = {}) => ({
  block: 3,
  type: 'paragraph',
  rect: { page: 0, x: 50, y: 50, w: 500, h: 700 },
  start: 100,
  chars: 2500,
  ...over
})

describe('splitStops', () => {
  it('parte un párrafo que ocupa la página entera en tramos manejables', () => {
    const stops = splitStops(book, [tall()])

    expect(stops.length).toBeGreaterThan(1)
    // Cada tramo cabe en pantalla y todos son del mismo bloque.
    for (const stop of stops) {
      expect(stop.rect.h).toBeLessThanOrEqual(792 * 0.45)
      expect(stop.block).toBe(3)
      expect(stop.type).toBe('paragraph')
    }
    // Sin huecos ni solapes, y el conjunto cubre el rectángulo original.
    expect(stops[0].rect.y).toBe(50)
    for (let i = 1; i < stops.length; i++) {
      expect(stops[i].rect.y).toBeCloseTo(stops[i - 1].rect.y + stops[i - 1].rect.h, 5)
    }
    const last = stops.at(-1)
    expect(last.rect.y + last.rect.h).toBeCloseTo(750, 5)
    // Los offsets avanzan con los tramos (anclan progreso y notas) y quedan
    // dentro del bloque.
    expect(stops[0].start).toBe(100)
    for (let i = 1; i < stops.length; i++) {
      expect(stops[i].start).toBeGreaterThan(stops[i - 1].start)
      expect(stops[i].start).toBeLessThan(100 + 2500)
    }
  })

  it('con parada por líneas, cada tramo abarca ese número de renglones', () => {
    const stops = splitStops(book, [tall()], 1)

    // 700pt de alto a 14pt por renglón son 50 tramos de una línea.
    expect(stops.length).toBe(50)
    for (const stop of stops.slice(0, -1)) {
      expect(stop.rect.h).toBeCloseTo(14, 5)
    }
  })

  it('deja como están las figuras, las páginas enteras y las regiones con rol', () => {
    const regions = [
      tall({ type: 'figure' }),
      tall({ type: 'page', chars: 0 }),
      tall({ role: 'toc', type: 'toc' })
    ]
    expect(splitStops(book, regions)).toEqual(regions)
  })

  it('un párrafo de tamaño normal queda intacto', () => {
    const normal = tall({ rect: { page: 0, x: 50, y: 50, w: 500, h: 120 }, chars: 400 })
    expect(splitStops(book, [normal])).toEqual([normal])
  })
})
