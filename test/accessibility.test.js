import { describe, it, expect, vi } from 'vitest'
import { contrastRatio } from '../src/accessibility/contrast.js'
import { createCommandRegistry } from '../src/input/commands.js'

describe('RX-A11Y-002 contraste y comandos', () => {
  it('calcula contraste WCAG conocido', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 2)
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 2)
  })

  it('desacopla un comando de su dispositivo', () => {
    const commands = createCommandRegistry()
    const move = vi.fn()
    const remove = commands.register('reader.move', move)
    commands.run('reader.move', 1)
    remove()
    commands.run('reader.move', 2)
    expect(move).toHaveBeenCalledOnce()
  })
})

