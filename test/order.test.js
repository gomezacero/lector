// El orden de lectura se prueba de dos maneras: con paginas sinteticas para
// cada regla, y con las detecciones reales del modelo sobre "Fisica
// Universitaria" (capturadas por la tarea `layout`; si faltan, esos tests se
// saltan).

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { orderBoxes } from '../src/layout/order.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const fixturePath = path.join(here, 'fixtures', 'layout-detections.json')

const box = (label, x, y, w, h, score = 0.9) => ({ label, score, x, y, w, h })

describe('orderBoxes', () => {
  it('lo de arriba antes, y dentro de una franja la columna izquierda entera', () => {
    const ordered = orderBoxes([
      box('text', 300, 200, 200, 300), // columna derecha
      box('title', 60, 40, 440, 60), // titulo a todo lo ancho
      box('text', 60, 350, 200, 150), // izquierda, segundo parrafo
      box('text', 60, 200, 200, 140) // izquierda, primer parrafo
    ])

    // Titulo, columna izquierda de arriba a abajo, y solo entonces la derecha.
    expect(ordered.map(b => [b.x, b.y])).toEqual([[60, 40], [60, 200], [60, 350], [300, 200]])
  })

  it('tira los titulillos y los folios, que no son paradas', () => {
    const ordered = orderBoxes([
      box('page-header', 60, 20, 300, 12),
      box('text', 60, 100, 400, 200),
      box('page-footer', 250, 700, 40, 10)
    ])

    expect(ordered).toHaveLength(1)
    expect(ordered[0].label).toBe('text')
  })

  it('funde el pie con su figura: se miran juntos', () => {
    const ordered = orderBoxes([
      box('picture', 60, 100, 300, 200),
      box('caption', 60, 310, 280, 14)
    ])

    expect(ordered).toHaveLength(1)
    expect(ordered[0].label).toBe('picture')
    // La caja crecio hasta cubrir el pie.
    expect(ordered[0].y + ordered[0].h).toBeCloseTo(324, 5)
  })

  it('un pie sin figura cerca se queda como parada propia', () => {
    const ordered = orderBoxes([
      box('picture', 60, 100, 300, 100),
      box('caption', 60, 500, 280, 14)
    ])

    expect(ordered).toHaveLength(2)
  })

  it('de un grupo de duplicados queda la caja de mas confianza', () => {
    const ordered = orderBoxes([
      box('section-header', 383, 199, 73, 11, 0.30),
      box('section-header', 383, 199, 75, 21, 0.74),
      box('section-header', 383, 200, 72, 20, 0.40)
    ])

    expect(ordered).toHaveLength(1)
    expect(ordered[0].score).toBe(0.74)
  })

  it('una formula dentro de un parrafo no es un duplicado', () => {
    const ordered = orderBoxes([
      box('text', 60, 100, 400, 200, 0.95),
      box('formula', 150, 160, 200, 20, 0.6)
    ])

    expect(ordered).toHaveLength(2)
  })
})

describe.skipIf(!existsSync(fixturePath))('orden sobre detecciones reales', () => {
  const fixture = existsSync(fixturePath)
    ? JSON.parse(readFileSync(fixturePath, 'utf8'))
    : []
  const of = page => fixture.find(r => r.page === page)?.detections ?? []

  it('la portadilla arranca por el titulo y no repite el rotulo de metas', () => {
    const ordered = orderBoxes(of(24))

    // El titulo del capitulo es la primera parada.
    expect(ordered[0].label).toBe('section-header')
    expect(ordered[0].y).toBeLessThan(60)

    // Los tres section-header duplicados del rotulo quedaron en uno.
    const metas = ordered.filter(b => b.label === 'section-header' && b.y > 190 && b.y < 210)
    expect(metas).toHaveLength(1)

    // Las metas se leen en su orden, una detras de otra.
    const items = ordered.filter(b => b.label === 'list-item')
    for (let i = 1; i < items.length; i++) {
      expect(items[i].y).toBeGreaterThan(items[i - 1].y)
    }
  })

  it('en la pagina de constantes cada tabla es una parada entera', () => {
    const ordered = orderBoxes(of(3))

    expect(ordered.filter(b => b.label === 'table')).toHaveLength(3)
    // Y el orden respeta la vertical: cabecera, su tabla, la siguiente.
    for (let i = 1; i < ordered.length; i++) {
      expect(ordered[i].y).toBeGreaterThanOrEqual(ordered[i - 1].y - 1)
    }
  })

  it('en una pagina del cuerpo el titulillo desaparece y el pie viaja con su figura', () => {
    const ordered = orderBoxes(of(60))

    expect(ordered.some(b => b.label === 'page-header')).toBe(false)
    expect(ordered.some(b => b.label === 'caption')).toBe(false)
    // La figura del final absorbe su pie: su caja llega hasta el.
    const picture = ordered.find(b => b.label === 'picture')
    expect(picture.y).toBeLessThanOrEqual(539.3)
  })
})
