// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { shortcutLabel, applyShortcutLabels } from '../src/platform/shortcuts.js'

describe('atajos por plataforma', () => {
  it('usa Command en macOS y Control en los demas sistemas', () => {
    expect(shortcutLabel('L', 'MacIntel')).toBe('⌘L')
    expect(shortcutLabel('L', 'Win32')).toBe('Ctrl+L')
    expect(shortcutLabel('L', 'Linux x86_64')).toBe('Ctrl+L')
  })

  it('actualiza las etiquetas visibles sin cambiar los aceleradores', () => {
    document.body.innerHTML = '<button id="hud-library"></button><button id="hud-settings"></button>'
    applyShortcutLabels(document, 'MacIntel')
    expect(document.getElementById('hud-library').title).toContain('⌘L')
    expect(document.getElementById('hud-settings').title).toContain('⌘,')
  })
})

