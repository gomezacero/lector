import { describe, it, expect } from 'vitest'
import { buildChapters, splitLongChapters, rechapterFromDates, MAX_CHAPTER_BLOCKS } from '../src/pdf/chapters.js'

const block = (text, page, type = 'paragraph') => ({ type, text, page })

describe('buildChapters', () => {
  it('usa el indice del PDF cuando el documento lo declara', () => {
    const blocks = [
      block('portadilla', 0),
      block('Uno', 1, 'heading'), block('texto', 1), block('mas texto', 2),
      block('Dos', 3, 'heading'), block('texto', 3)
    ]
    const outline = [
      { title: 'Capitulo uno', page: 1, depth: 0 },
      { title: 'Capitulo dos', page: 3, depth: 0 }
    ]

    expect(buildChapters(blocks, outline)).toEqual([
      { title: 'Comienzo', start: 0, end: 1 },
      { title: 'Capitulo uno', start: 1, end: 4 },
      { title: 'Capitulo dos', start: 4, end: 6 }
    ])
  })

  it('se queda con el nivel superior del indice e ignora las subsecciones', () => {
    const blocks = [
      block('Uno', 0, 'heading'), block('texto', 0),
      block('1.1', 1, 'heading'), block('texto', 1),
      block('Dos', 2, 'heading'), block('texto', 2)
    ]
    const outline = [
      { title: 'Parte I', page: 0, depth: 0 },
      { title: 'Seccion 1.1', page: 1, depth: 1 },
      { title: 'Parte II', page: 2, depth: 0 }
    ]

    expect(buildChapters(blocks, outline).map(c => c.title)).toEqual(['Parte I', 'Parte II'])
  })

  it('cae en los titulos detectados cuando no hay indice', () => {
    const blocks = [
      block('Primero', 0, 'heading'), block('texto', 0),
      block('Segundo', 1, 'heading'), block('texto', 1)
    ]

    expect(buildChapters(blocks, [])).toEqual([
      { title: 'Primero', start: 0, end: 2 },
      { title: 'Segundo', start: 2, end: 4 }
    ])
  })

  it('ignora marcadores que sólo son nombres de PDF concatenados', () => {
    const blocks = [
      block('Esto matará a aquello', 2, 'heading'),
      block('Que nuestros lectores nos perdonen...', 2)
    ]
    const outline = [
      { title: 'SinTitulo2.pdf (p.1-2)', page: 0, depth: 0 },
      { title: 'SinTitulo1.pdf (p.3-14)', page: 2, depth: 0 }
    ]

    expect(buildChapters(blocks, outline).map(c => c.title))
      .toEqual(['Sección 1'])
  })

  it('trocea el libro cuando no hay ninguna estructura', () => {
    const blocks = Array.from({ length: 250 }, (_, i) => block(`parrafo ${i}`, Math.floor(i / 30)))
    const chapters = buildChapters(blocks, [])

    expect(chapters).toHaveLength(3)
    expect(chapters.map(c => c.start)).toEqual([0, 100, 200])
    expect(chapters.at(-1).end).toBe(250)
  })

  it('cubre todos los bloques sin huecos ni solapes', () => {
    const blocks = [
      block('intro', 0),
      block('Uno', 0, 'heading'), block('a', 0),
      block('Dos', 1, 'heading'), block('b', 1)
    ]
    const chapters = buildChapters(blocks, [])

    expect(chapters[0].start).toBe(0)
    expect(chapters.at(-1).end).toBe(blocks.length)
    for (let i = 1; i < chapters.length; i++) {
      expect(chapters[i].start).toBe(chapters[i - 1].end)
    }
  })

  it('no devuelve nada si no hay bloques', () => {
    expect(buildChapters([], [])).toEqual([])
  })
})

describe('fechas de diario como capítulos', () => {
  // "La tregua": cada entrada abre con una fecha en cursiva pequeña que la
  // detección de títulos no ve, y el libro entero caía en un solo capítulo.
  const diary = [
    block('La tregua', 0),
    block('Sábado 23 de febrero', 1), block('Hoy almorcé solo, en el Centro.', 1),
    block('Domingo 24 de febrero', 2), block('No hay caso.', 2),
    block('Lunes 25 de febrero', 3), block('Otra entrada más del diario.', 3),
    block('11 de marzo de 1957', 4), block('También sin día de la semana.', 4)
  ]

  it('las líneas-fecha repetidas hacen de capítulos', () => {
    const chapters = buildChapters(diary, [])
    expect(chapters.map(c => c.title)).toEqual([
      'Comienzo', 'Sábado 23 de febrero', 'Domingo 24 de febrero',
      'Lunes 25 de febrero', '11 de marzo de 1957'
    ])
  })

  it('el índice que declara el PDF sigue mandando', () => {
    const outline = [
      { title: 'Primera parte', page: 1, depth: 0 },
      { title: 'Segunda parte', page: 3, depth: 0 }
    ]
    expect(buildChapters(diary, outline).map(c => c.title))
      .toEqual(['Comienzo', 'Primera parte', 'Segunda parte'])
  })

  it('unas pocas fechas no desplazan a los títulos detectados', () => {
    const blocks = [
      block('Uno', 0, 'heading'), block('texto', 0),
      block('3 de enero', 1), block('texto', 1),
      block('Dos', 2, 'heading'), block('4 de enero', 2), block('5 de enero', 2),
      block('Tres', 3, 'heading'), block('Cuatro', 4, 'heading')
    ]
    // Cuatro títulos contra tres fechas: mandan los títulos.
    expect(buildChapters(blocks, []).map(c => c.title))
      .toEqual(['Uno', 'Dos', 'Tres', 'Cuatro'])
  })

  it('una fecha dentro de un párrafo largo no cuenta', () => {
    const blocks = [
      block('El lunes 3 de enero fuimos al puerto y pasó de todo aquello.', 0),
      block('más prosa', 0), block('y más', 1)
    ]
    // Cae al troceado de reserva: la mención en prosa no crea capítulos.
    expect(buildChapters(blocks, []).map(c => c.title)).toEqual(['Sección 1'])
  })
})

describe('rechapterFromDates (migración v10)', () => {
  const diaryBook = () => ({
    version: 9,
    blocks: [
      { type: 'paragraph', text: 'La tregua', page: 0, start: 0 },
      { type: 'paragraph', text: 'Sábado 23 de febrero', page: 1, start: 10 },
      { type: 'paragraph', text: 'Hoy almorcé solo.', page: 1, start: 31 },
      { type: 'paragraph', text: 'Domingo 24 de febrero', page: 2, start: 49 },
      { type: 'paragraph', text: 'No hay caso.', page: 2, start: 71 },
      { type: 'paragraph', text: 'Lunes 25 de febrero', page: 3, start: 84 },
      { type: 'paragraph', text: 'Más texto del diario.', page: 3, start: 104 }
    ]
  })

  it('recapitula un cache sin estructura real', () => {
    const book = { ...diaryBook(), chapters: [
      { title: 'La tregua (1/2)', start: 0, end: 4 },
      { title: 'La tregua (2/2)', start: 4, end: 7 }
    ] }
    const out = rechapterFromDates(book)
    expect(out.version).toBe(10)
    expect(out.chapters.map(c => c.title)).toEqual(
      ['Comienzo', 'Sábado 23 de febrero', 'Domingo 24 de febrero', 'Lunes 25 de febrero'])
    // Ni los bloques ni los offsets se tocan.
    expect(out.blocks).toBe(book.blocks)
  })

  it('respeta unos capítulos con estructura de verdad', () => {
    const chapters = [
      { title: 'Prólogo', start: 0, end: 2 },
      { title: 'El encuentro', start: 2, end: 5 },
      { title: 'La cena', start: 5, end: 7 }
    ]
    const out = rechapterFromDates({ ...diaryBook(), chapters })
    expect(out.version).toBe(10)
    expect(out.chapters).toEqual(chapters)
  })
})

describe('splitLongChapters', () => {
  it('parte un capítulo desmesurado en tramos legibles y numerados', () => {
    const chapters = [{ title: 'Mecánica', start: 0, end: MAX_CHAPTER_BLOCKS * 2 + 10 }]
    const parts = splitLongChapters(chapters)

    expect(parts.length).toBe(3)
    expect(parts.map(p => p.title)).toEqual(['Mecánica (1/3)', 'Mecánica (2/3)', 'Mecánica (3/3)'])
    // Sin huecos ni solapes, y el conjunto cubre lo mismo que el original.
    expect(parts[0].start).toBe(0)
    expect(parts.at(-1).end).toBe(MAX_CHAPTER_BLOCKS * 2 + 10)
    for (let i = 1; i < parts.length; i++) {
      expect(parts[i].start).toBe(parts[i - 1].end)
    }
    for (const part of parts) {
      expect(part.end - part.start).toBeLessThanOrEqual(MAX_CHAPTER_BLOCKS)
    }
  })

  it('deja intactos los capítulos de tamaño normal', () => {
    const chapters = [
      { title: 'Uno', start: 0, end: 84 },
      { title: 'Dos', start: 84, end: 300 }
    ]
    expect(splitLongChapters(chapters)).toEqual(chapters)
  })
})
