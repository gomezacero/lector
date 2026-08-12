import { describe, it, expect, vi } from 'vitest'
import { effectiveWords, readingDurationMs, createReadingRhythm } from '../src/reader/readingRhythm.js'

describe('ritmo de lectura', () => {
  it('da más tiempo a la puntuación y a los títulos', () => {
    expect(effectiveWords('Uno, dos; tres.')).toBeGreaterThan(effectiveWords('Uno dos tres'))
    expect(readingDurationMs('Un título', 220, { heading: true }))
      .toBeGreaterThan(readingDurationMs('Un título', 220))
  })

  it('acorta la espera al subir la velocidad sin extremos incómodos', () => {
    const text = 'Una unidad de lectura con suficientes palabras para medir el ritmo correctamente.'
    expect(readingDurationMs(text, 400)).toBeLessThan(readingDurationMs(text, 160))
    expect(readingDurationMs('Sí.', 500)).toBeGreaterThanOrEqual(900)
    expect(readingDurationMs(text, 40)).toBeGreaterThan(readingDurationMs(text, 120))
  })

  it('aplica inmediatamente una velocidad manual más lenta a la unidad actual', () => {
    vi.useFakeTimers()
    const advance = vi.fn()
    const rhythm = createReadingRhythm({ clock: globalThis, onAdvance: advance, frameMs: 50 })
    rhythm.configure({ mode: 'auto', targetWpm: 200 })
    rhythm.enter({ key: 1, text: 'Una línea con diez palabras para comprobar una lectura bastante pausada' })
    vi.advanceTimersByTime(1_000)

    rhythm.configure({ targetWpm: 40 })
    vi.advanceTimersByTime(5_000)
    expect(advance).not.toHaveBeenCalled()
    vi.advanceTimersByTime(20_000)
    expect(advance).toHaveBeenCalledTimes(1)
    rhythm.stop()
    vi.useRealTimers()
  })

  it('sólo avanza al completar una unidad en modo automático', () => {
    vi.useFakeTimers()
    const advance = vi.fn()
    const rhythm = createReadingRhythm({ clock: globalThis, onAdvance: advance, frameMs: 50 })
    rhythm.configure({ mode: 'guided', targetWpm: 220 })
    rhythm.enter({ key: 1, text: 'Una frase breve.' })
    vi.advanceTimersByTime(30_000)
    expect(advance).not.toHaveBeenCalled()

    rhythm.configure({ mode: 'auto' })
    rhythm.enter({ key: 2, text: 'Otra frase breve.' })
    vi.advanceTimersByTime(30_000)
    expect(advance).toHaveBeenCalledTimes(1)
    rhythm.stop()
    vi.useRealTimers()
  })

  it('se detiene mientras la aplicación está suspendida', () => {
    vi.useFakeTimers()
    const advance = vi.fn()
    const rhythm = createReadingRhythm({ clock: globalThis, onAdvance: advance, frameMs: 50 })
    rhythm.configure({ mode: 'auto', targetWpm: 220 })
    rhythm.enter({ key: 1, text: 'Una frase breve.' })
    rhythm.setSuspended(true)
    vi.advanceTimersByTime(30_000)
    expect(advance).not.toHaveBeenCalled()
    rhythm.setSuspended(false)
    vi.advanceTimersByTime(30_000)
    expect(advance).toHaveBeenCalledTimes(1)
    rhythm.stop()
    vi.useRealTimers()
  })

  it('pausa y reanuda manualmente sin perder la unidad actual', () => {
    vi.useFakeTimers()
    const advance = vi.fn()
    const rhythm = createReadingRhythm({ clock: globalThis, onAdvance: advance, frameMs: 50 })
    rhythm.configure({ mode: 'auto', targetWpm: 180 })
    rhythm.enter({ key: 1, text: 'Una frase breve para leer con calma.' })
    expect(rhythm.togglePause()).toBe(true)
    vi.advanceTimersByTime(30_000)
    expect(advance).not.toHaveBeenCalled()
    expect(rhythm.togglePause()).toBe(false)
    vi.advanceTimersByTime(30_000)
    expect(advance).toHaveBeenCalledTimes(1)
    rhythm.stop()
    vi.useRealTimers()
  })
})
