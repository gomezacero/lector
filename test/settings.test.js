// @vitest-environment jsdom
// El reparto de ajustes: los de lectura viven con el libro, el resto con la
// aplicación, y los efectivos son los globales con los del libro encima.
// Aquí nació el bug del deslizador que reescribía library.json por píxel.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createSettings, READING_KEYS } from '../src/settings/settings.js'

const BASE = {
  readingMode: 'auto',
  pageStop: 'block',
  pageZoom: 1,
  fontSize: 20,
  lineHeight: 1.75,
  columnWidth: 640,
  focusEnabled: true,
  theme: 'dark',
  fontFamily: 'Sitka Text',
  blurAmount: 2.4,
  dimOpacity: 0.34,
  focusLines: 1,
  falloffLines: 1.6,
  textAlign: 'left'
}

let write = null

beforeEach(() => {
  vi.useFakeTimers()
  write = vi.fn()
  window.lector = { settings: { write } }
})

afterEach(() => {
  vi.useRealTimers()
  delete window.lector
})

describe('createSettings', () => {
  it('un ajuste de lectura va al libro abierto y no contamina los globales', () => {
    const settings = createSettings(BASE, { onBookChange () {} })
    settings.useBook({})

    settings.update({ fontSize: 28 })

    expect(settings.get('fontSize')).toBe(28)
    expect(settings.globals.fontSize).toBe(20)
  })

  it('sin libro abierto, el mismo ajuste pasa a ser el punto de partida global', () => {
    const settings = createSettings(BASE, {})
    settings.update({ fontSize: 28 })
    expect(settings.globals.fontSize).toBe(28)
  })

  it('cambiar de libro deja atrás sus ajustes', () => {
    const settings = createSettings(BASE, { onBookChange () {} })
    settings.useBook({ fontSize: 30 })
    expect(settings.get('fontSize')).toBe(30)

    settings.useBook({})
    expect(settings.get('fontSize')).toBe(20)
  })

  it('avisa del re-maquetado solo cuando cambia algo que mueve los saltos de línea', () => {
    const onLayoutChange = vi.fn()
    const settings = createSettings(BASE, { onLayoutChange })

    settings.update({ theme: 'sepia' })
    expect(onLayoutChange).not.toHaveBeenCalled()

    settings.update({ fontSize: 24 })
    expect(onLayoutChange).toHaveBeenCalledTimes(1)

    // El mismo valor otra vez no obliga a medir nada.
    settings.update({ fontSize: 24 })
    expect(onLayoutChange).toHaveBeenCalledTimes(1)
  })

  it('al disco solo bajan los globales, y una única vez por ráfaga', () => {
    const settings = createSettings(BASE, { onBookChange () {} })
    settings.useBook({})

    settings.update({ fontSize: 22 })
    settings.update({ fontSize: 24 })
    settings.update({ theme: 'light' })
    expect(write).not.toHaveBeenCalled()

    vi.advanceTimersByTime(500)
    expect(write).toHaveBeenCalledTimes(1)
    const saved = write.mock.calls[0][0]
    expect(saved.theme).toBe('light')
    // El cuerpo fue al libro: el global sigue siendo el punto de partida.
    expect(saved.fontSize).toBe(20)
  })
})

describe('READING_KEYS', () => {
  it('declara exactamente lo que viaja con cada libro', () => {
    expect([...READING_KEYS].sort()).toEqual(
      ['columnWidth', 'fontSize', 'lineHeight', 'pageStop', 'pageZoom', 'readingMode'])
  })
})
