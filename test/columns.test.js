import { describe, it, expect } from 'vitest'
import { findChannels, splitRow } from '../src/pdf/columns.js'

const PAGE_W = 612

const item = (x, w) => ({ text: 'x'.repeat(Math.max(1, Math.round(w / 6))), x, w, h: 15, y: 0 })

/** Renglones de dos columnas: un fragmento a cada lado del canal. */
const twoColumnRows = (count, { leftX = 86, leftW = 157, rightX = 260, rightW = 275 } = {}) =>
  Array.from({ length: count }, () => [item(leftX, leftW), item(rightX, rightW)])

describe('findChannels', () => {
  it('no ve canales en un texto corrido', () => {
    const rows = Array.from({ length: 20 }, () => [item(77, 458)])
    expect(findChannels(rows, PAGE_W)).toEqual([])
  })

  it('encuentra el canal entre la cita al margen y el cuerpo', () => {
    // El reparto real de "Las 48 leyes del poder": 86-243 y 260-535.
    const channels = findChannels(twoColumnRows(12), PAGE_W)

    expect(channels).toHaveLength(1)
    expect(channels[0]).toBeGreaterThan(243)
    expect(channels[0]).toBeLessThan(260)
  })

  it('no confunde los espacios entre palabras con un canal', () => {
    // Palabras sueltas cuyos huecos caen en sitios distintos en cada renglon.
    const rows = Array.from({ length: 30 }, (_, line) => {
      const row = []
      let x = 77
      while (x < 520) {
        const width = 28 + ((line * 7 + x) % 40)
        row.push(item(x, width))
        x += width + 5 + ((line * 3 + x) % 4)
      }
      return row
    })
    expect(findChannels(rows, PAGE_W)).toEqual([])
  })

  it('exige que el hueco se repita: uno suelto no basta', () => {
    const rows = [
      ...Array.from({ length: 10 }, () => [item(77, 458)]),
      [item(77, 150), item(300, 235)] // un solo renglon con hueco
    ]
    expect(findChannels(rows, PAGE_W)).toEqual([])
  })

  it('detecta el canal aunque despues el texto siga a todo lo ancho', () => {
    // La pagina 452 de "Las 48 leyes del poder": arriba dos columnas, abajo
    // el texto cruza el canal de lado a lado.
    const rows = [
      ...twoColumnRows(8, { leftX: 77, leftW: 275, rightX: 376, rightW: 150 }),
      ...Array.from({ length: 6 }, () => [item(77, 458)])
    ]
    const channels = findChannels(rows, PAGE_W)

    expect(channels).toHaveLength(1)
    expect(channels[0]).toBeGreaterThan(352)
    expect(channels[0]).toBeLessThan(376)
  })

  it('detecta las columnas aunque nunca compartan renglon', () => {
    // La pagina 455 de "Las 48 leyes del poder": la cita y el cuerpo van
    // desfasados media linea, asi que jamas se agrupan juntos. Aun asi son dos
    // columnas, y cada una tiene su propio margen.
    const rows = [
      ...Array.from({ length: 20 }, () => [item(86, 157)]),
      ...Array.from({ length: 20 }, () => [item(260, 275)])
    ]
    const channels = findChannels(rows, PAGE_W)

    expect(channels).toHaveLength(1)
    expect(channels[0]).toBeGreaterThan(246)
    expect(channels[0]).toBeLessThan(260)
  })

  it('separa tres columnas cuando las hay', () => {
    const rows = Array.from({ length: 12 }, () =>
      [item(60, 150), item(240, 150), item(420, 150)])
    expect(findChannels(rows, PAGE_W)).toHaveLength(2)
  })

  it('no se inventa canales en una pagina vacia', () => {
    expect(findChannels([], PAGE_W)).toEqual([])
  })
})

describe('splitRow', () => {
  it('reparte cada fragmento en su columna', () => {
    const { columns, wide } = splitRow([item(86, 157), item(260, 275)], [251])

    expect(columns).toHaveLength(2)
    expect(columns[0][0].x).toBe(86)
    expect(columns[1][0].x).toBe(260)
    expect(wide).toHaveLength(0)
  })

  it('separa en su propio flujo lo que cruza el canal de parte a parte', () => {
    // Si esto cayera en la primera columna, el grupo tendria dos margenes
    // izquierdos y la diferencia se leeria como sangria.
    const { columns, wide } = splitRow([item(77, 458)], [364])

    expect(wide).toHaveLength(1)
    expect(columns[0]).toHaveLength(0)
    expect(columns[1]).toHaveLength(0)
  })

  it('deja vacias las columnas donde ese renglon no tiene texto', () => {
    const { columns } = splitRow([item(376, 150)], [364])

    expect(columns[0]).toHaveLength(0)
    expect(columns[1]).toHaveLength(1)
  })
})
