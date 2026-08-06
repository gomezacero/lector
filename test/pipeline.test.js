// Prueba de extremo a extremo de la ingesta: compara el libro reconstruido
// contra el texto exacto con el que se genero el PDF.
//
// El JSON lo produce `npm run fixtures`, que corre el pipeline dentro de
// Electron (pdf.js necesita Worker y DOM). Si falta, el test lo dice en vez de
// fallar de forma confusa.

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CHAPTERS, BOOK_TITLE, BOOK_AUTHOR, RUNNING_HEAD } from './fixtures/make-pdf.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const bookPath = path.join(here, 'fixtures', 'ingest-libro-prueba.json')

let book

beforeAll(() => {
  if (!existsSync(bookPath)) {
    throw new Error(`Falta ${bookPath}. Ejecuta primero: npm run fixtures`)
  }
  book = JSON.parse(readFileSync(bookPath, 'utf8'))
})

describe('ingesta completa', () => {
  it('toma titulo y autor de los metadatos del PDF', () => {
    expect(book.title).toBe(BOOK_TITLE)
    expect(book.author).toBe(BOOK_AUTHOR)
  })

  it('reconstruye exactamente un bloque por titulo y parrafo del original', () => {
    const expected = CHAPTERS.flatMap(c => [
      { type: 'heading', text: c.title },
      ...c.paragraphs.map(text => ({ type: 'paragraph', text }))
    ])

    expect(book.blocks.map(b => ({ type: b.type, text: b.text }))).toEqual(expected)
  })

  it('descarta el titulillo repetido y los numeros de pagina', () => {
    const all = book.blocks.map(b => b.text).join('\n')
    expect(all).not.toContain(RUNNING_HEAD)
    expect(book.blocks.some(b => /^\d+$/.test(b.text.trim()))).toBe(false)
  })

  it('recompone las palabras partidas al final de linea', () => {
    // El generador parte una palabra con guion cada cinco lineas, asi que si
    // quedara alguna sin unir apareceria aqui.
    const dangling = book.blocks.filter(b => /\w-\s|\w-$/.test(b.text))
    expect(dangling).toEqual([])
  })

  it('detecta el estilo de parrafo del documento', () => {
    expect(book.stats.paragraphStyle).toBe('indent')
  })

  it('crea un capitulo por titulo, cubriendo todos los bloques sin huecos', () => {
    expect(book.chapters.map(c => c.title)).toEqual(CHAPTERS.map(c => c.title))

    expect(book.chapters[0].start).toBe(0)
    expect(book.chapters.at(-1).end).toBe(book.blocks.length)
    for (let i = 1; i < book.chapters.length; i++) {
      expect(book.chapters[i].start).toBe(book.chapters[i - 1].end)
    }
  })

  it('asigna a cada bloque su offset de caracter acumulado', () => {
    let offset = 0
    for (const block of book.blocks) {
      expect(block.start).toBe(offset)
      offset += block.text.length + 1
    }
    expect(book.chars).toBe(offset)
  })
})
