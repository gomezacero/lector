import { describe, it, expect } from 'vitest'
import { buildLines } from '../src/pdf/lines.js'

// Items tal y como los deja extract.js: origen arriba a la izquierda.
const item = (text, x, y, w, extra = {}) => ({
  text, x, y, w, h: 11.5, font: 'g_d0_f1', eol: false, rotated: false, scaleX: 1, ...extra
})

const page = items => ({ width: 595, height: 842, items })

describe('buildLines', () => {
  it('reune en un renglon los fragmentos que pdf.js entrega sueltos', () => {
    const lines = buildLines(page([
      item('mundo', 120, 100, 40),
      item('Hola ', 78, 100, 40)
    ]))

    expect(lines).toHaveLength(1)
    expect(lines[0].text).toBe('Hola mundo')
  })

  it('separa renglones distintos aunque lleguen desordenados', () => {
    const lines = buildLines(page([
      item('segunda', 78, 116, 50),
      item('primera', 78, 100, 50)
    ]))

    expect(lines.map(l => l.text)).toEqual(['primera', 'segunda'])
  })

  it('tolera que las lineas base no coincidan exactamente', () => {
    // Una versalita o un cambio de fuente desplaza la base unas decimas.
    const lines = buildLines(page([
      item('mismo', 78, 100, 40),
      item('renglon', 122, 102.4, 45)
    ]))

    expect(lines).toHaveLength(1)
  })

  it('inserta espacio solo cuando el hueco lo justifica', () => {
    // Un espacio en cuerpo 11.5 mide unos 2.9. Hueco de 1.5: kerning, va junto.
    const junto = buildLines(page([item('cami', 78, 100, 30), item('no', 109.5, 100, 14)]))
    expect(junto[0].text).toBe('camino')

    // Hueco de 4: por encima de un espacio, va separado.
    const separado = buildLines(page([item('un', 78, 100, 14), item('camino', 96, 100, 40)]))
    expect(separado[0].text).toBe('un camino')
  })

  it('descarta el texto girado, que nunca es prosa', () => {
    const lines = buildLines(page([
      item('legible', 78, 100, 40),
      item('marca de agua', 300, 400, 80, { rotated: true })
    ]))

    expect(lines.map(l => l.text)).toEqual(['legible'])
  })

  it('mide cada linea con la mediana, no con el primer fragmento', () => {
    // Una capitular grande no debe convertir el parrafo entero en titulo.
    const lines = buildLines(page([
      item('E', 78, 100, 18, { h: 24 }),
      item('l resto del renglon normal', 96, 100, 150),
      item(' y un poco mas', 246, 100, 80)
    ]))

    expect(lines[0].fontSize).toBe(11.5)
  })

  it('guarda el numero de pagina y los margenes de cada linea', () => {
    const lines = buildLines(page([item('texto', 78, 100, 60)]), 3)

    expect(lines[0].page).toBe(3)
    expect(lines[0].x).toBe(78)
    expect(lines[0].xEnd).toBe(138)
    expect(lines[0].width).toBe(60)
  })
})
