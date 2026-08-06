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

  describe('figuras', () => {
    // Un dibujo con varios trazos y solo rotulos dentro: eso es una figura.
    const artwork = (x, y, w, h) => ({ x, y, w, h, parts: 12, image: false })

    const withDrawings = (items, drawings) => ({ width: 595, height: 842, items, drawings })

    it('saca del texto los rotulos de dentro de una figura', () => {
      const lines = buildLines(withDrawings([
        item('Antes de la figura', 78, 100, 200),
        item('0', 120, 300, 6),
        item('50', 240, 300, 12),
        item('error (%)', 120, 200, 40),
        item('Despues de la figura', 78, 420, 200)
      ], [artwork(100, 150, 300, 200)]))

      const texts = lines.filter(l => !l.figure).map(l => l.text)
      expect(texts).toEqual(['Antes de la figura', 'Despues de la figura'])
    })

    it('deja la figura en el recorrido, en su sitio', () => {
      const lines = buildLines(withDrawings([
        item('Antes de la figura', 78, 100, 200),
        item('Despues de la figura', 78, 420, 200)
      ], [artwork(100, 150, 300, 200)]))

      expect(lines.map(l => l.figure ? 'FIGURA' : l.text))
        .toEqual(['Antes de la figura', 'FIGURA', 'Despues de la figura'])
    })

    it('no toma por figura un recuadro que enmarca parrafos', () => {
      // Es la diferencia entre resaltar una grafica y borrar media pagina: si
      // dentro hay prosa, el trazo es un marco y el texto tiene que leerse.
      const items = Array.from({ length: 8 }, (_, i) =>
        item(`linea ${i} de un parrafo enmarcado bastante largo`, 100, 160 + i * 16, 280))

      const lines = buildLines(withDrawings(items, [artwork(90, 140, 320, 160)]))

      expect(lines.filter(l => !l.figure)).toHaveLength(8)
      expect(lines.some(l => l.figure)).toBe(false)
    })

    it('ignora un trazo suelto, como el filete de un encabezado', () => {
      const lines = buildLines(withDrawings([
        item('texto de la pagina', 78, 100, 200),
        item('mas texto de la pagina', 78, 300, 200)
      ], [{ x: 100, y: 150, w: 300, h: 200, parts: 1, image: false }]))

      expect(lines.some(l => l.figure)).toBe(false)
      expect(lines).toHaveLength(2)
    })
  })

  it('guarda el numero de pagina y los margenes de cada linea', () => {
    const lines = buildLines(page([item('texto', 78, 100, 60)]), 3)

    expect(lines[0].page).toBe(3)
    expect(lines[0].x).toBe(78)
    expect(lines[0].xEnd).toBe(138)
    expect(lines[0].width).toBe(60)
  })
})

describe('espacios entre fuentes distintas', () => {
  const page = items => ({ width: 595, height: 842, items })

  it('separa un simbolo en cursiva de la palabra anterior', () => {
    // Medido en "Fisica Universitaria": entre el texto y el simbolo hay 0.25em,
    // por debajo de un espacio normal pero muy por encima de cero.
    const lines = buildLines(page([
      item('el peso', 78, 100, 34, { font: 'g_d0_f1' }),
      item('w', 115, 100, 6, { font: 'g_d0_f2' }),
      item('del anuncio', 124, 100, 52, { font: 'g_d0_f1' })
    ]))

    expect(lines[0].text).toBe('el peso w del anuncio')
  })

  it('no separa un subindice, que va pegado de verdad', () => {
    // En el mismo libro, "v" e "i" de un subindice van a hueco cero.
    const lines = buildLines(page([
      item('v', 78, 100, 5, { font: 'g_d0_f2' }),
      item('i', 83, 100, 3, { font: 'g_d0_f3' })
    ]))

    expect(lines[0].text).toBe('vi')
  })

  it('sigue sin partir palabras dentro de la misma fuente', () => {
    const lines = buildLines(page([
      item('cami', 78, 100, 30, { font: 'g_d0_f1' }),
      item('no', 109.5, 100, 14, { font: 'g_d0_f1' })
    ]))

    expect(lines[0].text).toBe('camino')
  })

  it('no separa cuando los fragmentos se tocan de verdad', () => {
    // Cambio de fuente pero sin hueco: es la misma palabra en versalitas.
    const lines = buildLines(page([
      item('MIS', 78, 100, 20, { font: 'g_d0_f2' }),
      item('terios', 98, 100, 30, { font: 'g_d0_f1' })
    ]))

    expect(lines[0].text).toBe('MISterios')
  })
})
