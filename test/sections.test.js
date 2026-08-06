import { describe, it, expect } from 'vitest'
import { detectSections, findBodyStart } from '../src/pdf/sections.js'

// Lineas tal y como las deja buildLines.
const line = (text, extra = {}) => ({ text, x: 80, xEnd: 480, y: 100, fontSize: 10, ...extra })

const page = (...texts) => ({ lines: texts.map(t => typeof t === 'string' ? line(t) : t) })

/** Una pagina de texto corrido cualquiera, para rellenar el libro. */
const prose = () => page(
  'Aureliano Buendía había de recordar aquella tarde remota en que su padre',
  'lo llevó a conocer el hielo. Macondo era entonces una aldea de veinte casas',
  'de barro y cañabrava construidas a la orilla de un río de aguas diáfanas',
  'que se precipitaban por un lecho de piedras pulidas, blancas y enormes')

const book = (...pages) => [...pages, ...Array.from({ length: 14 }, prose)]

describe('detectSections', () => {
  it('marca como cubierta la primera pagina, que trae cuatro renglones sueltos', () => {
    const roles = detectSections(book(page('EL TÚNEL', 'ERNESTO SÁBATO')))

    expect(roles.get(0)).toBe('cover')
  })

  it('no toma por cubierta la primera pagina de un articulo, que ya es texto', () => {
    const roles = detectSections(book(prose()))

    expect(roles.has(0)).toBe(false)
  })

  it('deja fuera la dedicatoria, que es del autor y se lee', () => {
    // Es corta como una cubierta y va justo detras: solo las separa el orden.
    const roles = detectSections(book(
      page('CIEN AÑOS DE SOLEDAD'),
      page('Para Jomi García Ascot', 'y María Luisa Elio')
    ))

    expect(roles.get(0)).toBe('cover')
    expect(roles.has(1)).toBe(false)
  })

  it('deja fuera un epigrafe en verso aunque quepa en cinco renglones', () => {
    const roles = detectSections(book(
      page('LA TREGUA'),
      prose(),
      page('Mi mano derecha es una golondrina',
        'Mi mano izquierda es un ciprés',
        'Mi cabeza por delante es un señor vivo',
        'Y por detrás es un señor muerto.')
    ))

    expect(roles.has(2)).toBe(false)
  })

  it('reconoce un indice por sus puntos guia', () => {
    const roles = detectSections(book(
      prose(),
      page(
        'Capítulo primero ..................... 7',
        'Capítulo segundo ................... 23',
        'Capítulo tercero ..................... 41',
        'Capítulo cuarto ...................... 58')
    ))

    expect(roles.get(1)).toBe('toc')
  })

  it('reconoce un indice sin puntos, por los numeros de pagina al final', () => {
    const roles = detectSections(book(
      prose(),
      page(
        'Movimiento en línea recta 34',
        'Movimiento en dos dimensiones 71',
        'Leyes del movimiento 106',
        'Aplicación de las leyes 136',
        'Trabajo y energía cinética 181',
        'Energía potencial 213',
        'Momento lineal 247',
        'Rotación de cuerpos rígidos 285')
    ))

    expect(roles.get(1)).toBe('toc')
  })

  it('no confunde una pagina de figuras rotuladas con un indice', () => {
    // Muchos pies acaban en numero; lo que falta es que sean casi todos.
    const roles = detectSections(book(prose(), page(
      '3x3 conv, 64',
      '3x3 conv, 128',
      'size: 224',
      'La figura muestra la arquitectura residual empleada en el experimento',
      'con bloques de dos capas y conexiones de salto entre ellos, tal y como',
      'se describe en la sección anterior y se resume en la tabla siguiente',
      'para las cuatro profundidades comparadas en este trabajo de referencia',
      'y sus resultados sobre el conjunto de validación de mil categorías')))

    expect(roles.size).toBe(0)
  })

  it('sigue el indice por las paginas siguientes, que ya no llevan titulo', () => {
    const roles = detectSections(book(
      prose(),
      page({ ...line('Contenido'), fontSize: 16 }),
      page('Mecánica 12', 'Ondas 88', 'Termodinámica 140'),
      page('Electricidad 201', 'Óptica 260')
    ))

    expect(roles.get(1)).toBe('toc')
    expect(roles.get(2)).toBe('toc')
    expect(roles.get(3)).toBe('toc')
  })

  it('corta el indice en cuanto vuelve el texto corrido', () => {
    const roles = detectSections(book(
      prose(),
      page({ ...line('Índice'), fontSize: 16 }),
      page('Mecánica 12', 'Ondas 88'),
      prose()
    ))

    expect(roles.get(2)).toBe('toc')
    expect(roles.has(3)).toBe(false)
  })

  it('reconoce tambien el indice alfabetico del final, que lleva el mismo trato', () => {
    const pages = [...Array.from({ length: 18 }, prose), page(
      'aceleración, 34, 71, 106',
      'ángulo, 88, 92',
      'campo eléctrico, 201',
      'energía cinética, 181, 213',
      'fuerza normal, 136',
      'momento lineal, 247',
      'ondas estacionarias, 288',
      'velocidad angular, 285')]

    const roles = detectSections(pages)
    expect(roles.get(18)).toBe('toc')
  })

  it('no marca nada si le saliera un cuarto del libro', () => {
    // Preferible dejarlo todo como esta que plegarle medio libro al lector.
    const dotted = page(
      'Capítulo uno ......... 7',
      'Capítulo dos ......... 23',
      'Capítulo tres ........ 41')
    const roles = detectSections(Array.from({ length: 8 }, () => dotted))

    expect(roles.size).toBe(0)
  })

  it('no marca cubierta en un documento de pocas paginas', () => {
    const roles = detectSections([page('Un título'), prose(), prose()])

    expect(roles.has(0)).toBe(false)
  })
})

describe('findBodyStart', () => {
  const blocks = (...roles) => roles.map((role, i) => ({
    role, start: i * 100, text: 'x'.repeat(99)
  }))

  it('salta lo marcado y se posa en el primer bloque de lectura', () => {
    // Tres bloques de preliminares en un libro de cincuenta: 300 de 5.000
    // caracteres, muy por debajo del tope.
    const list = blocks('cover', 'toc', 'toc',
      ...Array.from({ length: 47 }, () => undefined))

    expect(findBodyStart(list, 5000)).toBe(3)
  })

  it('no salta nada si el libro empieza directamente', () => {
    expect(findBodyStart(blocks(undefined, undefined), 200)).toBe(0)
  })

  it('no salta si dejaria atras mas de un quinto del libro', () => {
    // Con el marcado equivocado, perderse el principio es peor que no saltar.
    const list = blocks(...Array.from({ length: 30 }, () => 'toc'), undefined)

    expect(findBodyStart(list, 3100)).toBe(0)
  })

  it('no salta si todo el libro estuviera marcado', () => {
    expect(findBodyStart(blocks('cover', 'toc'), 200)).toBe(0)
  })
})
