// toItems se prueba de dos maneras: con lineas sinteticas para las reglas
// (filtro de confianza, un item por linea, linea base) y con salida real de
// Tesseract capturada por la tarea `ocr`, que ademas se hace pasar por el
// pipeline entero para comprobar que reconstruye el texto original.
//
// El fixture real lo genera `node scripts/run-electron-task.mjs ocr
// test/fixtures/libro-prueba.pdf`. Si falta, esos tests se saltan (con el
// aviso de vitest): generarlo cuesta un minuto de OCR y no siempre hace falta.

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { toItems } from '../src/ocr/toItems.js'
import { buildLines } from '../src/pdf/lines.js'
import { toBlocks } from '../src/pdf/blocks.js'
import { CHAPTERS } from './fixtures/make-pdf.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const fixturePath = path.join(here, 'fixtures', 'ocr-tesseract.json')

// --- Sinteticos ------------------------------------------------------------

const word = (text, confidence, x0, x1, y0 = 100, y1 = 120) =>
  ({ text, confidence, bbox: { x0, y0, x1, y1 } })

const lineOf = (words, { baseline } = {}) => ({
  bbox: {
    x0: Math.min(...words.map(w => w.bbox.x0)),
    y0: Math.min(...words.map(w => w.bbox.y0)),
    x1: Math.max(...words.map(w => w.bbox.x1)),
    y1: Math.max(...words.map(w => w.bbox.y1))
  },
  baseline,
  words
})

const blockOf = (...lines) => [{ paragraphs: [{ lines }] }]

describe('toItems', () => {
  it('emite un item por linea, con las palabras ya separadas por espacios', () => {
    const items = toItems(blockOf(lineOf([
      word('las', 90, 100, 160),
      word('palabras', 91, 172, 340),
      word('juntas', 89, 352, 470)
    ])), { scale: 2 }).items

    expect(items).toHaveLength(1)
    expect(items[0].text).toBe('las palabras juntas')
    expect(items[0].font).toBe('ocr')
    expect(items[0].eol).toBe(true)
  })

  it('descarta las manchas leidas como letras, no la linea entera', () => {
    const items = toItems(blockOf(lineOf([
      word('texto', 92, 100, 200),
      word('|.', 12, 210, 216), // una mota del escaneo
      word('legible', 88, 230, 360)
    ])), { scale: 2 }).items

    expect(items[0].text).toBe('texto legible')
  })

  it('divide las coordenadas por la escala del rasterizado', () => {
    const items = toItems(blockOf(lineOf(
      [word('hola', 90, 200, 400)],
      { baseline: { x0: 200, y0: 116, x1: 400, y1: 116 } }
    )), { scale: 2 }).items

    expect(items[0].x).toBe(100)
    expect(items[0].w).toBe(100)
    // La y es la LINEA BASE que declara Tesseract, entre escala.
    expect(items[0].y).toBe(58)
  })

  it('sin linea base declarada la estima cerca del borde inferior', () => {
    const items = toItems(blockOf(lineOf([word('hola', 90, 200, 400, 100, 120)])), { scale: 1 }).items

    expect(items[0].y).toBeGreaterThan(110)
    expect(items[0].y).toBeLessThanOrEqual(120)
  })

  it('pondera la confianza por caracteres, en 0..1', () => {
    const { confidence } = toItems(blockOf(lineOf([
      word('aaaaaaaaaa', 100, 0, 100), // diez caracteres seguros
      word('bb', 50, 110, 130) // dos dudosos
    ])), { scale: 1 })

    expect(confidence).toBeCloseTo(0.92, 2)
  })

  it('con nada que leer devuelve vacio y confianza cero', () => {
    expect(toItems([], { scale: 1 })).toEqual({ items: [], confidence: 0 })
  })
})

// --- Salida real de Tesseract ----------------------------------------------

describe.skipIf(!existsSync(fixturePath))('toItems con salida real', () => {
  const fixture = existsSync(fixturePath)
    ? JSON.parse(readFileSync(fixturePath, 'utf8'))
    : null

  it('produce items bien formados dentro de la pagina', () => {
    const { items, confidence } = toItems(fixture.blocks, { scale: fixture.scale })

    expect(items.length).toBeGreaterThan(20)
    expect(confidence).toBeGreaterThan(0.8)
    for (const item of items) {
      expect(item.text.trim().length).toBeGreaterThan(0)
      expect(item.x).toBeGreaterThanOrEqual(0)
      expect(item.y).toBeGreaterThan(0)
      expect(item.y).toBeLessThanOrEqual(fixture.height)
      expect(item.w).toBeGreaterThan(0)
      expect(item.h).toBeGreaterThan(4)
      expect(item.h).toBeLessThan(40)
    }
  })

  it('el pipeline reconstruye el texto original desde los items', () => {
    const { items } = toItems(fixture.blocks, { scale: fixture.scale })
    const page = {
      width: fixture.width,
      height: fixture.height,
      lines: buildLines({ width: fixture.width, height: fixture.height, items, drawings: [], images: [] }, 0)
    }
    const { blocks } = toBlocks([page])

    // Con una sola pagina el titulillo repetido no se puede detectar (esa
    // regla mide repeticion entre paginas), asi que el titulo se busca en vez
    // de asumir que abre la lista.
    const headingAt = blocks.findIndex(b => b.text === CHAPTERS[0].title)
    expect(headingAt).toBeGreaterThanOrEqual(0)

    const original = CHAPTERS[0].paragraphs[0]
    const reconstruido = blocks[headingAt + 1].text
    expect(similarity(reconstruido, original)).toBeGreaterThan(0.95)
  })
})

/** 1 - distancia de edicion normalizada: 1 es identico. */
function similarity (a, b) {
  const m = a.length
  const n = b.length
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    const row = [i]
    for (let j = 1; j <= n; j++) {
      row.push(Math.min(
        prev[j] + 1,
        row[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      ))
    }
    prev = row
  }
  return 1 - prev[n] / Math.max(m, n)
}
