// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { createFocusController } from '../src/reader/focus.js'

describe('RX-PAGE-003 limites de pagina', () => {
  it('crea limites estables y navega de forma reversible', () => {
    const stage = document.createElement('div')
    const sharp = document.createElement('div')
    Object.defineProperty(stage, 'clientHeight', { value: 200 })
    Object.defineProperty(stage, 'offsetHeight', { value: 200 })
    const focus = createFocusController({ stage, sharpLayer: sharp })
    focus.setSettings({ verticalMargin: 24, focusLines: 1, falloffLines: 1 })
    focus.setLines(Array.from({ length: 10 }, (_, index) => ({
      top: index * 40, bottom: index * 40 + 20, block: 0, start: index, end: index + 1
    })))
    focus.setPresentation('paged')
    focus.moveTo(0, { animate: false })
    const second = focus.movePage(1)
    expect(second).toBeGreaterThan(0)
    focus.moveTo(second, { animate: false })
    expect(focus.pageIndex).toBe(1)
    expect(focus.movePage(-1)).toBe(0)
  })
})

