// El ancla de todo: la búsqueda binaria del bloque, el porcentaje que
// descuenta los preliminares y el estado que se persiste. Una desviación de
// uno aquí mueve el punto de lectura y las notas de todos los libros.

import { describe, it, expect } from 'vitest'
import { blockAtOffset, chapterAtOffset, startOffset, percentAt, makeProgress } from '../src/reader/progress.js'

// Tres bloques de 10 caracteres (start 0, 11, 22; separador de 1) y el
// primero es la cubierta: el cuerpo empieza en el segundo.
const book = {
  chars: 33,
  bodyStart: 1,
  provisional: false,
  blocks: [
    { text: 'cubiertaaa', start: 0, page: 0 },
    { text: 'capitulo11', start: 11, page: 1 },
    { text: 'capitulo22', start: 22, page: 2 }
  ],
  chapters: [
    { title: 'Preliminares', start: 0, end: 1 },
    { title: 'Uno', start: 1, end: 3 }
  ]
}

describe('blockAtOffset', () => {
  it('encuentra el bloque que contiene cada offset', () => {
    expect(blockAtOffset(book, 0)).toBe(0)
    expect(blockAtOffset(book, 10)).toBe(0) // el separador pertenece al anterior
    expect(blockAtOffset(book, 11)).toBe(1)
    expect(blockAtOffset(book, 21)).toBe(1)
    expect(blockAtOffset(book, 22)).toBe(2)
  })

  it('un offset más allá del final cae en el último bloque', () => {
    expect(blockAtOffset(book, 999)).toBe(2)
  })

  it('sin bloques devuelve 0', () => {
    expect(blockAtOffset({ blocks: [] }, 50)).toBe(0)
  })
})

describe('chapterAtOffset', () => {
  it('resuelve el capítulo por el bloque del offset', () => {
    expect(chapterAtOffset(book, 0)).toBe(0)
    expect(chapterAtOffset(book, 11)).toBe(1)
    expect(chapterAtOffset(book, 30)).toBe(1)
  })
})

describe('startOffset y percentAt', () => {
  it('la lectura arranca en el cuerpo, no en la cubierta', () => {
    expect(startOffset(book)).toBe(11)
  })

  it('el porcentaje descuenta los preliminares', () => {
    expect(percentAt(book, 11)).toBe(0)
    expect(percentAt(book, 33)).toBe(1)
    // La cubierta queda por detrás del arranque: nunca es negativo.
    expect(percentAt(book, 0)).toBe(0)
  })
})

describe('makeProgress', () => {
  it('guarda el offset con sus anclas de repuesto', () => {
    const progress = makeProgress(book, 22)
    expect(progress.offset).toBe(22)
    expect(progress.chapter).toBe(1)
    expect(progress.page).toBe(2)
    // El contexto empieza justo en el offset: es lo que re-ancla tras un
    // reproceso.
    expect(progress.context.startsWith('capitulo22')).toBe(true)
  })

  it('en un libro provisional la página es el propio offset', () => {
    const bare = { chars: 6, provisional: true, blocks: [], chapters: [] }
    expect(makeProgress(bare, 4).page).toBe(4)
  })
})
