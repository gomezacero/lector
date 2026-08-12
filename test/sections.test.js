import { describe, it, expect } from 'vitest'
import { detectSections, detectOpeners, findBodyStart } from '../src/pdf/sections.js'

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

  it('acepta una cubierta con créditos al pie cuando tiene tipografía de cartel', () => {
    const cover = page(
      line('CÓMO GANAR AMIGOS', { fontSize: 32 }),
      line('E INFLUIR SOBRE LAS PERSONAS', { fontSize: 26 }),
      line('DALE CARNEGIE', { fontSize: 24 }),
      ...Array.from({ length: 8 }, (_, index) => line(`crédito digital ${index}`, { fontSize: 8 })))
    const roles = detectSections(book(cover), 10)
    expect(roles.get(0)).toBe('cover')
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

  it('aparta una ficha legal situada después de una portada gráfica', () => {
    const graphicCover = { lines: [{ figure: true, rect: { x: 0, y: 0, w: 600, h: 800 } }] }
    const credits = page(
      'Nuestra señora de París',
      'Hugo, Victor Novela',
      'Se reconocen los derechos morales de Victor Hugo.',
      'Obra de dominio público. Distribución gratuita.',
      'Fundación Carlos Slim contacto@pruebat.org')
    const roles = detectSections(book(graphicCover, credits), 10)

    expect(roles.get(0)).toBe('cover')
    expect(roles.get(1)).toBe('credits')
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

  it('marca como referencia una tabla de conversiones', () => {
    // Como la contracubierta de "Fisica Universitaria": renglones cortos
    // llenos de cifras y signos de igual, sin un solo parrafo.
    const roles = detectSections(book(prose(), page(
      'FACTORES DE CONVERSIÓN',
      'Longitud',
      '1 m = 100 cm = 1000 mm',
      '1 km = 1000 m = 0.6214 mi',
      '1 m = 3.281 ft = 39.37 in',
      '1 cm = 0.3937 in',
      '1 in = 2.540 cm',
      '1 ft = 30.48 cm',
      'Masa',
      '1 kg = 1000 g = 0.0685 slug',
      '1 g = 6.85 × 10 slug',
      '1 slug = 14.59 kg',
      '1 u = 1.661 × 10 kg',
      '1 lb = 4.448 N')))

    expect(roles.get(1)).toBe('reference')
  })

  it('marca como referencia una lista de actividades con sus numeros', () => {
    const roles = detectSections(book(prose(), page(
      'ESTRATEGIAS PARA RESOLVER PROBLEMAS',
      '1.1', 'Cómo resolver problemas de física', '3',
      '1.2', 'Conversiones de unidades', '7',
      '1.3', 'Suma de vectores', '18',
      '2.1', 'Movimiento con aceleración constante', '51',
      '3.1', 'Movimiento de proyectil', '82')))

    expect(roles.get(1)).toBe('reference')
  })

  it('no marca una pagina del cuerpo aunque venga llena de ecuaciones', () => {
    // Las ecuaciones cortas van siempre escoltadas por parrafos: eso la salva.
    const roles = detectSections(book(prose(), page(
      'La segunda ley de Newton relaciona la fuerza neta que actúa sobre un',
      'cuerpo con la aceleración que ese cuerpo adquiere, de modo que ambas',
      'magnitudes resultan proporcionales entre sí para una masa constante',
      'F = ma',
      'a = F/m',
      'v = v0 + at',
      'x = x0 + v0 t',
      'v2 = v02 + 2ax',
      'F12 = -F21',
      'p = mv',
      'W = Fd',
      'K = mv2/2',
      'donde cada símbolo conserva el significado que se le dio al principio',
      'del capítulo y las unidades se expresan en el Sistema Internacional')))

    expect(roles.size).toBe(0)
  })

  it('no confunde con referencia una pagina de versos, que no lleva cifras', () => {
    const roles = detectSections(book(prose(), page(
      'Mi mano derecha es una golondrina',
      'Mi mano izquierda es un ciprés',
      'Mi cabeza por delante',
      'es un señor vivo',
      'y por detrás',
      'es un señor muerto',
      'La lluvia cae',
      'sobre los tejados',
      'y nadie la mira',
      'como se mira un río',
      'La tarde se apaga',
      'sin hacer ruido',
      'y el día se va',
      'como vino')))

    expect(roles.size).toBe(0)
  })

  it('marca la portadilla de poster: titulo gigante y foto', () => {
    // Como el arranque de capitulo de "Fisica Universitaria": cuerpo 7.5,
    // titulo a 22.8, fotografia y recuadro de metas.
    const portadilla = {
      lines: [
        line('UNIDADES,', { fontSize: 22.8 }),
        line('CANTIDADES FÍSICAS', { fontSize: 22.8 }),
        { figure: true, rect: { x: 60, y: 175, w: 260, h: 190 } },
        line('Ser capaz de predecir la trayectoria', { fontSize: 7.9 }),
        line('de un huracán resulta esencial', { fontSize: 7.9 })
      ]
    }

    expect(detectOpeners([prose(), portadilla], [1], 7.5).has(1)).toBe(true)
  })

  it('no marca el capitulo de una novela, que abre en grande pero es prosa', () => {
    const capitulo = {
      lines: [
        line('XVII', { fontSize: 26 }),
        ...prose().lines,
        ...prose().lines
      ]
    }

    expect(detectOpeners([capitulo], [0], 11).size).toBe(0)
  })

  it('no examina mas paginas que las que abren capitulo', () => {
    const poster = {
      lines: [line('UN CARTEL CUALQUIERA', { fontSize: 30 }), line('con dos rotulos')]
    }

    expect(detectOpeners([poster], [], 10).size).toBe(0)
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

  it('sigue un índice numerado aunque no imprima las páginas destino', () => {
    const roles = detectSections(book(
      prose(),
      page({ ...line('Índice'), fontSize: 16 }),
      page('1. Primer capítulo', '2. Segundo capítulo', '3. Tercer capítulo',
        '4. Cuarto capítulo', '5. Quinto capítulo', '6. Sexto capítulo')
    ))
    expect(roles.get(2)).toBe('toc')
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
