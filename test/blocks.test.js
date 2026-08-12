import { describe, it, expect } from 'vitest'
import {
  measureBody, measurePageTypography, findFurniture, stripFurniture,
  detectParagraphStyle, joinLines, buildBlocks, toBlocks
} from '../src/pdf/blocks.js'

const PAGE_H = 842

const line = (text, { x = 78, y = 200, size = 11.5, width = 430, page = 0 } = {}) => ({
  text, x, xEnd: x + width, width, y, fontSize: size, font: 'body', page
})

/** Columna de lineas de cuerpo, una debajo de otra. */
const column = (texts, { page = 0, top = 120, leading = 16.4, ...rest } = {}) =>
  texts.map((text, i) => line(text, { y: top + i * leading, page, ...rest }))

describe('measureBody', () => {
  it('toma como cuerpo el tamano que cubre mas texto, no el mas repetido', () => {
    const lines = [
      line('Un titulo corto', { size: 20, width: 120 }),
      ...column(['linea larga de cuerpo con mucho texto', 'otra linea larga igual de cuerpo'])
    ]

    expect(measureBody(lines).bodySize).toBe(11.5)
  })

  it('deduce margenes e interlineado de las lineas de cuerpo', () => {
    const metrics = measureBody(column(['una', 'dos', 'tres']))

    expect(metrics.bodyLeft).toBe(78)
    expect(metrics.bodyRight).toBe(508)
    expect(metrics.leading).toBeCloseTo(16.4, 1)
  })
})

describe('metricas por pagina', () => {
  it('mide cuerpo e interlineado de cada pagina con texto de sobra', () => {
    const lines = [
      ...column(Array.from({ length: 9 }, (_, i) => `linea de cuerpo numero ${i}`), { page: 0, leading: 12 }),
      ...column(Array.from({ length: 9 }, (_, i) => `preliminar con mas aire ${i}`), { page: 1, leading: 18, size: 14 })
    ]
    const pages = measurePageTypography(lines)

    expect(pages.get(0).bodySize).toBe(11.5)
    expect(pages.get(0).leading).toBeCloseTo(12, 1)
    expect(pages.get(1).bodySize).toBe(14)
    expect(pages.get(1).leading).toBeCloseTo(18, 1)
  })

  it('con pocos renglones no inventa medidas: se usara la del documento', () => {
    const pages = measurePageTypography(column(['una', 'dos', 'tres']))

    expect(pages.has(0)).toBe(false)
  })

  it('el cuerpo local evita que los preliminares se llenen de falsos titulos', () => {
    // Un libro de cuerpo 11.5 cuyos preliminares van a 14: antes, cada
    // renglon corto de 14 pasaba por titulo por ser mayor que el cuerpo
    // global. El titulo de verdad, a 18, sigue siendolo.
    const cuerpo = Array.from({ length: 12 }, (_, i) =>
      `renglon del cuerpo del libro con su texto corriente y su medida ${i}`)
    const preliminar = [
      line('SOBRE LOS AUTORES', { page: 1, y: 100, size: 18, width: 200 }),
      ...column(Array.from({ length: 9 }, (_, i) => `biografia breve del autor ${i}`),
        { page: 1, top: 140, leading: 19, size: 14, width: 200 })
    ]
    const { blocks } = toBlocks([
      { width: 560, height: PAGE_H, lines: column(cuerpo, { page: 0, leading: 13 }) },
      { width: 560, height: PAGE_H, lines: preliminar }
    ])

    const enPreliminar = blocks.filter(b => b.page === 1)
    expect(enPreliminar[0].type).toBe('heading')
    expect(enPreliminar.filter(b => b.type === 'heading')).toHaveLength(1)
  })

  it('el interlineado local evita partir la pagina compuesta con mas aire', () => {
    // Con el interlineado global (12) el aire de 18 de los preliminares
    // superaba el umbral de "hueco extra" y cada dos renglones nacia un
    // parrafo: las biografias de los autores salian en tiras.
    const cuerpo = Array.from({ length: 12 }, (_, i) =>
      `renglon del cuerpo del libro con su texto corriente y su medida ${i}`)
    const bio = Array.from({ length: 8 }, (_, i) =>
      `parrafo biografico que sigue y sigue sin cambiar de asunto ${i}`)
    const { blocks } = toBlocks([
      { width: 560, height: PAGE_H, lines: column(cuerpo, { page: 0, leading: 12 }) },
      { width: 560, height: PAGE_H, lines: column(bio, { page: 1, leading: 18 }) }
    ])

    // Un solo bloque toca la pagina 1 (puede venir continuado de la anterior,
    // eso es un parrafo legitimo): lo roto era que salieran cuatro tiras.
    expect(blocks.filter(b => b.rects.some(r => r.page === 1))).toHaveLength(1)
  })
})

describe('mobiliario de pagina', () => {
  const pages = [0, 1, 2, 3]

  it('elimina un folio inferior aunque el OCR lo mida mayor que el cuerpo', () => {
    const lines = [
      ...column(['texto corriente de la página', 'que continúa normalmente']),
      line('18', { y: 790, size: 14, width: 14 })
    ]
    const blocks = buildBlocks(stripFurniture(lines, 842, 20, { bodySize: 10 }), measureBody(lines), 'indent')
    expect(blocks.some(item => item.text === '18')).toBe(false)
  })

  it('detecta el titulillo que se repite en la mayoria de las paginas', () => {
    const lines = pages.flatMap(p => [
      line('EL JARDIN DE LOS SENDEROS', { y: 40, page: p, size: 8 }),
      ...column(['cuerpo de la pagina'], { page: p })
    ])

    const furniture = findFurniture(lines, PAGE_H, pages.length)
    expect(furniture.has('head|el jardin de los senderos')).toBe(true)
  })

  it('trata como el mismo titulillo el que lleva el numero de pagina dentro', () => {
    const lines = pages.map(p => line(`Capitulo 2 - ${100 + p}`, { y: 40, page: p, size: 8 }))

    const furniture = findFurniture(lines, PAGE_H, pages.length)
    expect(furniture.has('head|capitulo # - #')).toBe(true)
  })

  it('conserva los titulos de capitulos numerados, que comparten forma', () => {
    // "Capitulo 1", "Capitulo 2"... normalizan todos a "capitulo #" y salen en
    // todas las paginas: sin mirar el cuerpo de letra se borrarian enteros.
    const many = Array.from({ length: 12 }, (_, p) => p)
    const lines = many.flatMap(p => [
      line(`Capitulo ${p + 1}`, { y: 82, page: p, size: 16, width: 120 }),
      ...column(['texto largo del cuerpo de la pagina'], { page: p, top: 140 })
    ])

    const kept = stripFurniture(lines, PAGE_H, many.length, measureBody(lines))
    expect(kept.filter(l => /^Capitulo /.test(l.text))).toHaveLength(12)
  })

  it('sigue tirando el titulillo aunque lleve numeros, si es del cuerpo del texto', () => {
    const many = Array.from({ length: 12 }, (_, p) => p)
    const lines = many.flatMap(p => [
      line(`El jardin de los senderos - ${100 + p}`, { y: 40, page: p, size: 8, width: 150 }),
      ...column(['texto largo del cuerpo de la pagina'], { page: p, top: 140 })
    ])

    const kept = stripFurniture(lines, PAGE_H, many.length, measureBody(lines))
    expect(kept.some(l => /jardin/.test(l.text))).toBe(false)
  })

  it('no toca un titulo de capitulo, que aparece una sola vez', () => {
    const lines = [
      line('Capitulo primero', { y: 82, page: 0, size: 16, width: 120 }),
      ...pages.flatMap(p => column(['cuerpo'], { page: p }))
    ]

    const kept = stripFurniture(lines, PAGE_H, pages.length)
    expect(kept.some(l => l.text === 'Capitulo primero')).toBe(true)
  })

  it('tira los folios sueltos aunque cada pagina lleve uno distinto', () => {
    const lines = pages.flatMap(p => [
      ...column(['cuerpo'], { page: p }),
      line(String(p + 1), { y: 800, page: p, width: 8 })
    ])

    const kept = stripFurniture(lines, PAGE_H, pages.length)
    expect(kept.every(l => !/^\d+$/.test(l.text))).toBe(true)
  })

  it('reconoce tambien la numeracion romana de los preliminares', () => {
    const lines = pages.flatMap(p => [
      ...column(['cuerpo'], { page: p }),
      line(['i', 'ii', 'iii', 'iv'][p], { y: 800, page: p, width: 8 })
    ])

    expect(stripFurniture(lines, PAGE_H, pages.length)).toHaveLength(4)
  })

  it('respeta un numero que forma parte del texto, fuera del margen', () => {
    const lines = column(['1936'], { top: 400 })
    expect(stripFurniture(lines, PAGE_H, 4)).toHaveLength(1)
  })
})

describe('detectParagraphStyle', () => {
  it('reconoce los libros que marcan el parrafo con sangria', () => {
    const lines = [
      ...column(['abre el parrafo', 'sigue', 'termina']),
      ...column(['nuevo parrafo sangrado'], { top: 170, x: 96 }),
      ...column(['sigue el segundo', 'y acaba'], { top: 190 })
    ]

    expect(detectParagraphStyle(lines, measureBody(lines))).toBe('indent')
  })

  it('reconoce los que lo marcan con un hueco vertical', () => {
    const lines = [
      ...column(['uno', 'dos', 'tres', 'cuatro']),
      ...column(['tras el hueco', 'sigue', 'acaba', 'final'], { top: 220 })
    ]

    expect(detectParagraphStyle(lines, measureBody(lines))).toBe('spacing')
  })

  it('cae en el ancho de linea cuando no hay ninguna de las dos senales', () => {
    const lines = column(['uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete'])

    expect(detectParagraphStyle(lines, measureBody(lines))).toBe('ragged')
  })
})

describe('joinLines', () => {
  it('recompone la palabra partida cuando la siguiente linea sigue en minuscula', () => {
    expect(joinLines([line('el maquetador par-'), line('tio la palabra')]))
      .toBe('el maquetador partio la palabra')
  })

  it('respeta el guion de un compuesto real', () => {
    expect(joinLines([line('el acuerdo franco-'), line('Aleman de 1963')]))
      .toBe('el acuerdo franco-Aleman de 1963')
  })

  it('une con un espacio las lineas normales', () => {
    expect(joinLines([line('primera linea'), line('segunda linea')]))
      .toBe('primera linea segunda linea')
  })
})

describe('buildBlocks', () => {
  it('separa los parrafos por la sangria en los libros que la usan', () => {
    const lines = [
      ...column(['abre el primero', 'y termina']),
      line('sangrado, luego es nuevo', { y: 153, x: 96 }),
      ...column(['continuacion del segundo'], { top: 170 })
    ]
    const metrics = measureBody(lines)
    const blocks = buildBlocks(lines, metrics, 'indent')

    expect(blocks.map(b => b.text)).toEqual([
      'abre el primero y termina',
      'sangrado, luego es nuevo continuacion del segundo'
    ])
  })

  it('no toma por sangria un salto enorme: eso es otra zona de la pagina', () => {
    // Una nota al margen en x=300 con el cuerpo en x=78. Sin techo, sus 4
    // renglones salian como 4 parrafos: es lo que rompia "Fisica Universitaria".
    const lines = [
      ...column(['cuerpo de la pagina', 'que sigue aqui']),
      ...column(['nota al margen', 'que continua', 'y termina'], { top: 200, x: 300, width: 90 })
    ]
    const blocks = buildBlocks(lines, measureBody(lines), 'indent')

    expect(blocks.map(b => b.text)).toContain('nota al margen que continua y termina')
  })

  it('la sangria es un escalon: no se repite dos renglones seguidos', () => {
    // Los renglones de continuacion de una lista cuelgan todos a la misma
    // altura; solo el primero es un escalon respecto al anterior.
    const lines = [
      line('abre el parrafo', { y: 120 }),
      line('sangrado, abre otro', { y: 136.4, x: 96 }),
      line('cuelga igual que el anterior', { y: 152.8, x: 96 }),
      line('y este tambien', { y: 169.2, x: 96 })
    ]
    const blocks = buildBlocks(lines, measureBody(lines), 'indent')

    expect(blocks).toHaveLength(2)
    expect(blocks[1].text).toBe('sangrado, abre otro cuelga igual que el anterior y este tambien')
  })

  it('separa por el hueco vertical sea cual sea el estilo', () => {
    const lines = [...column(['uno', 'dos']), ...column(['lejos'], { top: 220 })]
    const blocks = buildBlocks(lines, measureBody(lines), 'indent')

    expect(blocks.map(b => b.text)).toEqual(['uno dos', 'lejos'])
  })

  it('marca como titulo la linea corta y de cuerpo mayor', () => {
    const lines = [
      line('Capitulo primero', { y: 100, size: 16, width: 120 }),
      ...column(['empieza el texto normal del capitulo'], { top: 140 })
    ]
    const blocks = buildBlocks(lines, measureBody(lines), 'indent')

    expect(blocks.map(b => b.type)).toEqual(['heading', 'paragraph'])
    expect(blocks[0].text).toBe('Capitulo primero')
  })

  it('no confunde con un titulo una linea corta del mismo cuerpo', () => {
    const lines = [
      ...column(['una linea larga de cuerpo normal']),
      line('final corto', { y: 136, width: 90 })
    ]
    const blocks = buildBlocks(lines, measureBody(lines), 'indent')

    expect(blocks.every(b => b.type === 'paragraph')).toBe(true)
  })
})

describe('rectangulos de los bloques', () => {
  it('encierra todas las lineas del parrafo', () => {
    const lines = [
      line('primera linea del parrafo', { y: 120, x: 78, width: 430 }),
      line('segunda, mas corta', { y: 136.4, x: 78, width: 300 })
    ]
    const [block] = buildBlocks(lines, measureBody(lines), 'indent')
    const [rect] = block.rects

    expect(rect.page).toBe(0)
    expect(rect.x).toBe(78)
    expect(rect.w).toBe(430)
    // Sube un ascendente sobre la primera base y baja un descendente bajo la ultima.
    expect(rect.y).toBeLessThan(120)
    expect(rect.y + rect.h).toBeGreaterThan(136.4)
  })

  it('da un rectangulo por pagina cuando el parrafo continua en la siguiente', () => {
    const lines = [
      line('acaba la pagina', { y: 700, page: 0 }),
      line('y sigue en la otra', { y: 100, page: 1 })
    ]
    const [block] = buildBlocks(lines, measureBody(lines), 'spacing')

    expect(block.rects).toHaveLength(2)
    expect(block.rects.map(r => r.page)).toEqual([0, 1])
  })
})

describe('toBlocks', () => {
  it('encadena limpieza, medicion y agrupacion sobre paginas completas', () => {
    // Cada pagina: titulillo, dos parrafos de dos lineas marcados con sangria,
    // y el folio al pie. Solo debe sobrevivir el cuerpo.
    const pages = [0, 1, 2, 3].map(p => ({
      width: 595,
      height: PAGE_H,
      lines: [
        line('TITULILLO REPETIDO', { y: 40, page: p, size: 8, width: 150 }),
        line(`pagina ${p + 1}, primer parrafo`, { y: 120, page: p, x: 96 }),
        line('que continua en la segunda linea', { y: 136.4, page: p }),
        line(`pagina ${p + 1}, segundo parrafo`, { y: 152.8, page: p, x: 96 }),
        line('y su continuacion', { y: 169.2, page: p }),
        line(String(p + 1), { y: 800, page: p, width: 8 })
      ]
    }))

    const { blocks, style } = toBlocks(pages)

    expect(style).toBe('indent')
    expect(blocks).toHaveLength(8)
    expect(blocks[0].text).toBe('pagina 1, primer parrafo que continua en la segunda linea')
    expect(blocks[1].text).toBe('pagina 1, segundo parrafo y su continuacion')
    expect(blocks.at(-1).text).toBe('pagina 4, segundo parrafo y su continuacion')
    expect(blocks.some(b => /TITULILLO/.test(b.text))).toBe(false)
  })
})

describe('palabra partida al final del renglon', () => {
  it('no corta el parrafo si el renglon lleno acaba con una palabra partida', () => {
    // Un renglon que llega al margen y acaba en guion continua, aunque el
    // siguiente arranque sangrado por un ajuste optico.
    const lines = [
      line('el maquetador partio la pala-', { y: 120, width: 430 }),
      line('bra justo aqui y sigue', { y: 136.4, x: 90 })
    ]
    const blocks = buildBlocks(lines, measureBody(lines), 'indent')

    expect(blocks).toHaveLength(1)
    expect(blocks[0].text).toBe('el maquetador partio la palabra justo aqui y sigue')
  })

  it('si el renglon acabo corto, el guion no basta para unir', () => {
    // Un guion al final de un renglon que no llega al margen es un final de
    // parrafo con un compuesto, no una palabra partida.
    const lines = [
      line('un final corto con guion-', { y: 120, width: 150 }),
      line('Otro parrafo distinto', { y: 136.4, x: 96, width: 430 })
    ]
    const blocks = buildBlocks(lines, measureBody(lines), 'indent')

    expect(blocks).toHaveLength(2)
  })
})

describe('dialogos y listas, que se parecen pero no son lo mismo', () => {
  it('separa los turnos de un dialogo aunque esten sangrados igual', () => {
    // Cada intervencion es un parrafo y todas arrancan a la misma altura: lo
    // que las separa es que la anterior acabo corta.
    const lines = [
      // Cuerpo del libro, que fija el margen en 78.
      ...column(['prosa que llena la medida del libro', 'y continua en el renglon siguiente']),
      line('-Es su hermana.', { y: 160, x: 96, width: 90 }),
      line('-No me importa -replico.', { y: 176.4, x: 96, width: 130 }),
      line('Pietro se enjugo la frente.', { y: 192.8, x: 96, width: 160 })
    ]
    const blocks = buildBlocks(lines, measureBody(lines), 'indent')

    // El parrafo de prosa mas los tres turnos.
    expect(blocks).toHaveLength(4)
  })

  it('une la continuacion colgante de una lista', () => {
    // Aqui los renglones llenan la medida, asi que continuan.
    const lines = [
      ...column(['prosa que llena la medida del libro', 'y continua en el renglon siguiente']),
      line('primer punto de la lista que llena', { y: 160, x: 96, width: 412 }),
      line('la medida y sigue en el siguiente', { y: 176.4, x: 96, width: 412 }),
      line('renglon hasta acabar.', { y: 192.8, x: 96, width: 120 })
    ]
    const blocks = buildBlocks(lines, measureBody(lines), 'indent')

    // El parrafo de prosa y la lista entera, sin trocear.
    expect(blocks).toHaveLength(2)
  })
})
