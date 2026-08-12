import { describe, it, expect } from 'vitest'
import { migrateBook, validateBook, reanchor, contextAt, textOf } from '../src/pdf/migrate.js'

// Un libro minimo pero bien formado: offsets acumulados, una pagina por bloque.
const makeBook = (texts, { version = 5, pagePerBlock = null } = {}) => {
  let start = 0
  const blocks = texts.map((text, i) => {
    const block = {
      type: 'paragraph',
      text,
      page: pagePerBlock ? pagePerBlock[i] : i,
      start,
      rects: [{ page: pagePerBlock ? pagePerBlock[i] : i, x: 72, y: 100, w: 400, h: 20 }]
    }
    start += text.length + 1
    return block
  })
  const pageCount = Math.max(...blocks.map(b => b.page)) + 1
  return {
    version,
    pageCount,
    pageSizes: Array.from({ length: pageCount }, () => ({ w: 612, h: 792 })),
    pageKinds: Array.from({ length: pageCount }, () => null),
    chars: start,
    blocks,
    chapters: [{ title: 'Uno', start: 0, end: blocks.length }]
  }
}

const FRASES = [
  'El coronel Aureliano Buendía había de recordar aquella tarde remota.',
  'Macondo era entonces una aldea de veinte casas de barro y cañabrava.',
  'El mundo era tan reciente que muchas cosas carecían de nombre.',
  'Todos los años, por el mes de marzo, una familia de gitanos desarrapados.',
  'José Arcadio Buendía, cuya desaforada imaginación iba siempre más lejos.'
]

describe('migrateBook', () => {
  it('lleva un cache v4 a v5 en sitio, sin tocar bloques ni offsets', () => {
    const v4 = makeBook(FRASES, { version: 4 })
    delete v4.pageKinds

    const result = migrateBook(v4, 5)

    expect(result.rebuild).toBeUndefined()
    expect(result.book.version).toBe(5)
    expect(result.book.pageKinds).toHaveLength(v4.pageCount)
    expect(result.book.blocks).toEqual(v4.blocks)
    expect(validateBook(result.book)).toEqual([])
  })

  it('pide reproceso cuando no hay camino de migracion', () => {
    // Un cache anterior a v4 —los hay en biblioteca desde las primeras
    // versiones— no tiene transformacion en sitio: se reprocesa.
    const antiguo = makeBook(FRASES, { version: 2 })
    delete antiguo.pageKinds

    expect(migrateBook(antiguo, 6)).toEqual({ rebuild: true })
  })

  it('pide reproceso cuando la migracion siguiente lo exige', () => {
    // v5 -> v6 clasifica las paginas, y eso solo se puede hacer con el PDF.
    const v4 = makeBook(FRASES, { version: 4 })
    delete v4.pageKinds

    expect(migrateBook(v4, 6)).toEqual({ rebuild: true })
  })

  it('lleva v10 a v11 sin mover bloques ni offsets', () => {
    const v10 = makeBook(FRASES, { version: 10 })
    const originalBlocks = structuredClone(v10.blocks)
    const result = migrateBook(v10, 11)
    expect(result.book.version).toBe(11)
    expect(result.book.blocks).toEqual(originalBlocks)
    expect(result.book.bodyEnd).toBe(v10.blocks.length)
  })
})

describe('validateBook', () => {
  it('acepta un libro bien formado', () => {
    expect(validateBook(makeBook(FRASES))).toEqual([])
  })

  it('detecta offsets que no son la suma de los textos', () => {
    const book = makeBook(FRASES)
    book.blocks[2].start += 3

    expect(validateBook(book).join(' ')).toContain('offset')
  })

  it('detecta pageKinds de otra longitud', () => {
    const book = makeBook(FRASES)
    book.pageKinds = [null]

    expect(validateBook(book).join(' ')).toContain('pageKinds')
  })

  it('detecta un bodyEnd fuera de los bloques', () => {
    const book = makeBook(FRASES)
    book.bodyEnd = book.blocks.length + 1

    expect(validateBook(book).join(' ')).toContain('bodyEnd')
  })

  it('detecta un bloque que apunta a una pagina inexistente', () => {
    const book = makeBook(FRASES)
    book.blocks[0].rects[0].page = 99

    expect(validateBook(book).join(' ')).toContain('pagina inexistente')
  })

  it('tolera coordenadas fuera de la pagina, que son reales', () => {
    // "Fisica Universitaria" trae rects con y negativa; eso lo recorta el
    // lector, no es un cache roto.
    const book = makeBook(FRASES)
    book.blocks[0].rects[0].y = -21

    expect(validateBook(book)).toEqual([])
  })
})

describe('contextAt', () => {
  it('empieza exactamente en el offset pedido', () => {
    const book = makeBook(FRASES)
    const offset = book.blocks[1].start

    expect(contextAt(book, offset).startsWith('Macondo era entonces')).toBe(true)
  })

  it('cruza bloques con el mismo separador que cuentan los offsets', () => {
    const book = makeBook(['corto', 'siguiente'])
    expect(contextAt(book, 0, 12)).toBe('corto\nsiguie')
  })
})

describe('reanchor', () => {
  it('deja el offset donde estaba si el texto no cambio', () => {
    const book = makeBook(FRASES)
    const offset = book.blocks[3].start + 10

    expect(reanchor(book, book, { offset })).toBe(offset)
  })

  it('sigue a la frase cuando algo se inserta por delante', () => {
    const viejo = makeBook(FRASES)
    const nuevo = makeBook(['Un prologo nuevo que antes no estaba.', ...FRASES])
    const offset = viejo.blocks[2].start

    const moved = reanchor(viejo, nuevo, { offset })

    expect(textOf(nuevo).slice(moved, moved + 20)).toBe('El mundo era tan rec')
  })

  it('sigue a la frase cuando algo desaparece por delante', () => {
    const viejo = makeBook(FRASES)
    const nuevo = makeBook(FRASES.slice(1))
    const offset = viejo.blocks[4].start

    const moved = reanchor(viejo, nuevo, { offset })

    expect(textOf(nuevo).slice(moved, moved + 12)).toBe('José Arcadio')
  })

  it('con texto repetido elige la aparicion mas cercana a la esperada', () => {
    const repetida = 'La misma frase repetida palabra por palabra en dos capitulos distintos.'
    const relleno = 'Parrafo de relleno que separa las dos apariciones de la frase. '.repeat(40)
    const viejo = makeBook([repetida, relleno, repetida])
    const nuevo = makeBook([repetida, relleno, repetida])
    const alFinal = viejo.blocks[2].start

    expect(reanchor(viejo, nuevo, { offset: alFinal })).toBe(nuevo.blocks[2].start)
  })

  it('usa el contexto guardado aunque el cache viejo ya no exista', () => {
    const nuevo = makeBook(FRASES)

    const moved = reanchor(null, nuevo, {
      offset: 0,
      context: 'El mundo era tan reciente que muchas'
    })

    expect(moved).toBe(nuevo.blocks[2].start)
  })

  it('cae a la pagina cuando el texto ya no aparece', () => {
    // Tras un OCR ninguna palabra tiene por que sobrevivir igual.
    const viejo = makeBook(['glifos rotos €%&# sin sentido'])
    const nuevo = makeBook(FRASES)

    const moved = reanchor(viejo, nuevo, { offset: 5, page: 3 })

    expect(moved).toBe(nuevo.blocks.find(b => b.page === 3).start)
  })

  it('como ultimo recurso mantiene la proporcion, dentro del libro', () => {
    const viejo = makeBook(['texto viejo irrecuperable que no aparece'])
    const nuevo = makeBook(FRASES)

    const moved = reanchor(viejo, nuevo, { offset: 20 })

    expect(moved).toBeGreaterThanOrEqual(0)
    expect(moved).toBeLessThan(nuevo.chars)
  })
})
