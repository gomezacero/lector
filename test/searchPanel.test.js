// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest'
import { createSearchPanel } from '../src/search/searchPanel.js'

describe('SearchPanel', () => {
  it('limpia la consulta y se oculta por completo al cerrar', () => {
    const onClose = vi.fn()
    const panel = createSearchPanel({
      onClose,
      onSearch: vi.fn(() => []),
      onGo: vi.fn(),
      onBack: vi.fn(),
      canBack: () => false
    })
    document.body.append(panel.element)
    panel.open()

    const input = panel.element.querySelector('.search-input')
    input.value = 'Melquíades'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    const clear = panel.element.querySelector('.search-clear')
    expect(clear.hidden).toBe(false)
    clear.click()
    expect(input.value).toBe('')
    expect(panel.element.querySelector('.search-summary').textContent).toContain('dos caracteres')

    panel.close()
    expect(panel.element.hidden).toBe(true)
    expect(panel.element.inert).toBe(true)
    document.body.removeChild(panel.element)
  })
})
