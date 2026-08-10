import { describe, it, expect } from 'vitest'
import { splitSentences, toSentenceUnits } from '../src/reader/sentences.js'

/** Las frases como texto, que es lo que se puede leer de un vistazo. */
const cut = text => splitSentences(text).map(s => text.slice(s.start, s.end))

describe('splitSentences', () => {
  it('corta por el punto', () => {
    expect(cut('Vino a verme. Se sentó. No dijo nada.'))
      .toEqual(['Vino a verme.', 'Se sentó.', 'No dijo nada.'])
  })

  it('corta tambien por interrogacion y exclamacion', () => {
    expect(cut('¿Quién anda ahí? Nadie contestó. ¡Qué extraño!'))
      .toEqual(['¿Quién anda ahí?', 'Nadie contestó.', '¡Qué extraño!'])
  })

  it('devuelve el texto entero cuando no hay puntuacion final', () => {
    expect(cut('una frase sin punto')).toEqual(['una frase sin punto'])
  })

  it('no corta en una abreviatura', () => {
    expect(cut('Vino el Sr. Pérez a las diez. Se fue enseguida.'))
      .toEqual(['Vino el Sr. Pérez a las diez.', 'Se fue enseguida.'])
  })

  it('no corta en las iniciales de un nombre', () => {
    expect(cut('Lo escribió J. R. R. Tolkien. Nadie lo dudaba.'))
      .toEqual(['Lo escribió J. R. R. Tolkien.', 'Nadie lo dudaba.'])
  })

  it('no corta dentro de un numero', () => {
    expect(cut('Mide 1.75 metros. Pesa 70 kilos.'))
      .toEqual(['Mide 1.75 metros.', 'Pesa 70 kilos.'])
  })

  it('no corta en "etc." ni en "p. ej."', () => {
    expect(cut('Traía libros, mapas, etc. Todo cabía en la maleta.'))
      .toEqual(['Traía libros, mapas, etc.', 'Todo cabía en la maleta.'])
  })

  it('se queda con el cierre de comillas dentro de la frase', () => {
    expect(cut('Dijo «no me esperes.» Y se marchó.'))
      .toEqual(['Dijo «no me esperes.»', 'Y se marchó.'])
  })

  it('trata los puntos suspensivos como final', () => {
    expect(cut('No sé qué decir… Mejor me callo.'))
      .toEqual(['No sé qué decir…', 'Mejor me callo.'])
  })

  it('corta los dialogos con raya', () => {
    expect(cut('—No vengas. —Ya voy.'))
      .toEqual(['—No vengas.', '—Ya voy.'])
  })

  it('no deja frases vacias ni espacios sueltos', () => {
    for (const sentence of cut('Uno.   Dos.    Tres.')) {
      expect(sentence.trim()).toBe(sentence)
      expect(sentence).not.toBe('')
    }
  })

  it('cubre todo el texto sin huecos ni solapes', () => {
    const text = 'Primera frase. Segunda frase, más larga que la anterior. ¿Y la tercera?'
    const parts = splitSentences(text)

    expect(parts[0].start).toBe(0)
    for (let i = 1; i < parts.length; i++) {
      expect(parts[i].start).toBeGreaterThanOrEqual(parts[i - 1].end)
    }
    expect(parts.at(-1).end).toBe(text.length)
  })

  it('con un texto vacio no devuelve nada', () => {
    expect(splitSentences('')).toEqual([])
    expect(splitSentences('   ')).toEqual([])
  })
})

describe('toSentenceUnits', () => {
  // Un parrafo de cuatro renglones con dos frases: la segunda empieza a mitad
  // del segundo renglon y termina en el cuarto.
  const text = 'Primero llevaron el imán. Un gitano corpulento, de barba montaraz y manos de gorrión, que se presentó con el nombre de Melquíades, hizo una demostración.'
  const blocks = [{ text, start: 0 }]
  const lines = [
    { block: 0, start: 0, end: 40, top: 0, bottom: 30 },
    { block: 0, start: 40, end: 84, top: 30, bottom: 60 },
    { block: 0, start: 84, end: 130, top: 60, bottom: 90 },
    { block: 0, start: 130, end: text.length, top: 90, bottom: 120 }
  ]

  it('una unidad por frase', () => {
    expect(toSentenceUnits(lines, blocks)).toHaveLength(2)
  })

  it('dos frases cortas sobre los mismos renglones comparten parada', () => {
    // «¿Mario Vignale? No me acuerdo.» cabe en un renglón: pararse dos veces
    // sobre la misma banda es un tartamudeo, no una guía.
    const short = '¿Mario Vignale? No me acuerdo. Pero no tuve valor para confesárselo aquella tarde.'
    const shortBlocks = [{ text: short, start: 0 }]
    const shortLines = [
      { block: 0, start: 0, end: 44, top: 0, bottom: 30 },
      { block: 0, start: 44, end: short.length, top: 30, bottom: 60 }
    ]

    const units = toSentenceUnits(shortLines, shortBlocks)
    expect(units).toHaveLength(2)
    // La primera parada reúne las dos frases del primer renglón…
    expect(units[0].start).toBe(0)
    expect(units[0].end).toBe(30)
    expect(units[0].top).toBe(0)
    expect(units[0].bottom).toBe(30)
    // …y la segunda es la frase larga que sigue.
    expect(units[1].end).toBe(short.length)
  })

  it('la unidad abarca todos los renglones que toca la frase', () => {
    const [, segunda] = toSentenceUnits(lines, blocks)

    // La frase arranca en el primer renglon (el carácter 26 cae dentro) y
    // termina en el ultimo: la unidad va de uno a otro.
    expect(segunda.top).toBe(0)
    expect(segunda.bottom).toBe(120)
  })

  it('las unidades se solapan en el renglon compartido', () => {
    const [primera, segunda] = toSentenceUnits(lines, blocks)

    // Las dos frases conviven en el primer renglon, y las dos lo iluminan.
    expect(primera.top).toBe(0)
    expect(primera.bottom).toBe(30)
    expect(segunda.top).toBe(0)
  })

  it('cada unidad conserva el tramo de texto de su frase', () => {
    const [primera, segunda] = toSentenceUnits(lines, blocks)

    expect(text.slice(primera.start, primera.end)).toBe('Primero llevaron el imán.')
    expect(text.slice(segunda.start, segunda.end)).toMatch(/^Un gitano corpulento/)
  })

  it('deja pasar los bloques sin texto, como las figuras', () => {
    const figure = [{ block: 0, start: 0, end: 0, top: 0, bottom: 50, figure: true }]
    expect(toSentenceUnits(figure, [{ text: '', start: 0 }])).toHaveLength(1)
  })
})
