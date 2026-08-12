import { describe, it, expect, vi } from 'vitest'
import { createWellbeingController } from '../src/wellbeing/wellbeingController.js'

describe('RX-BREAK-001 actividad y limites', () => {
  it('espera al limite de unidad antes de avisar', () => {
    const onBreak = vi.fn()
    const clock = { setInterval: vi.fn(() => 1), clearInterval: vi.fn() }
    const wellbeing = createWellbeingController({ clock, documentRef: { hidden: false }, onBreak })
    const now = Date.now()
    wellbeing.start({ interval: 20 })
    wellbeing.activity(now)
    // Ticks acotados a cinco segundos: se simulan 240 para veinte minutos.
    for (let i = 1; i <= 240; i++) {
      wellbeing.activity(now + i * 5000)
      wellbeing.tick(now + i * 5000)
    }
    expect(onBreak).not.toHaveBeenCalled()
    expect(wellbeing.boundary()).toBe(true)
    expect(onBreak).toHaveBeenCalledOnce()
  })

  it('no acumula con la ventana oculta ni escribe sin consentimiento', () => {
    const onStats = vi.fn()
    const clock = { setInterval: vi.fn(() => 1), clearInterval: vi.fn() }
    const documentRef = { hidden: true }
    const wellbeing = createWellbeingController({ clock, documentRef, onStats })
    wellbeing.start({ interval: 20, collect: false })
    wellbeing.tick(Date.now() + 30_000)
    wellbeing.stop()
    expect(wellbeing.stats.activeMs).toBe(0)
    expect(onStats).not.toHaveBeenCalled()
  })
})
