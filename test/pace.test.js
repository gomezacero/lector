// El ritmo de lectura: caracteres por minuto medidos sobre la lectura real.
// La estimación solo vale si ignora lo que no es leer: saltos, pausas y
// repeticiones de tecla.

import { describe, it, expect } from 'vitest'
import { createPace } from '../src/reader/pace.js'

// Un lector constante: 60 caracteres cada 4 segundos = 900 por minuto.
function steady (pace, steps = 40, chars = 60, ms = 4000) {
  for (let i = 0; i <= steps; i++) pace.record(i * chars, i * ms)
}

describe('createPace', () => {
  it('converge a la velocidad real de un lector constante', () => {
    const pace = createPace()
    steady(pace)
    expect(pace.ready).toBe(true)
    expect(pace.cpm).toBeGreaterThan(700)
    expect(pace.cpm).toBeLessThan(1100)
  })

  it('no está listo con un puñado de muestras', () => {
    const pace = createPace()
    steady(pace, 5)
    expect(pace.ready).toBe(false)
    expect(pace.minutesFor(1000)).toBe(null)
  })

  it('un salto por la barra o el índice no cuenta como lectura', () => {
    const pace = createPace()
    steady(pace)
    const before = pace.cpm
    pace.record(50_000, 41 * 4000) // salto enorme
    pace.record(50_060, 42 * 4000) // y sigue leyendo
    expect(Math.abs(pace.cpm - before) / before).toBeLessThan(0.2)
  })

  it('una pausa larga no hunde la velocidad', () => {
    const pace = createPace()
    steady(pace)
    const before = pace.cpm
    pace.record(40 * 60 + 60, 40 * 4000 + 30 * 60_000) // media hora fuera
    expect(pace.cpm).toBe(before)
  })

  it('retroceder no cuenta', () => {
    const pace = createPace()
    steady(pace)
    const before = pace.cpm
    pace.record(100, 41 * 4000)
    expect(pace.cpm).toBe(before)
  })

  it('estima los minutos que quedan', () => {
    const pace = createPace()
    steady(pace)
    // ~900 cpm: 1800 caracteres son unos 2 minutos.
    expect(pace.minutesFor(1800)).toBeGreaterThan(1.4)
    expect(pace.minutesFor(1800)).toBeLessThan(2.6)
  })

  it('arranca con la velocidad persistida de otras sesiones', () => {
    const pace = createPace(800)
    expect(pace.ready).toBe(true)
    expect(pace.minutesFor(800)).toBeCloseTo(1, 1)
  })
})
