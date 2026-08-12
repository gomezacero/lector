// @vitest-environment jsdom

import { describe, it, expect } from 'vitest'
import { createAppShellController } from '../src/app/appShellController.js'

const fakePanel = () => {
  let open = false
  return {
    open: () => { open = true },
    close: () => { open = false },
    get isOpen () { return open }
  }
}

describe('AppShellController', () => {
  it('mantiene un solo panel activo y la misma opcion lo cierra', () => {
    const hud = document.createElement('nav')
    const chapterMenu = document.createElement('div')
    chapterMenu.hidden = true
    const shell = createAppShellController({ body: document.body, hud, chapterMenu })
    const settings = fakePanel()
    const notes = fakePanel()
    const search = fakePanel()
    shell.registerPanels(settings, notes, search)

    expect(shell.showPanel('search')).toBe('search')
    expect(search.isOpen).toBe(true)
    expect(document.body.dataset.panel).toBe('search')

    expect(shell.showPanel('notes')).toBe('notes')
    expect(search.isOpen).toBe(false)
    expect(notes.isOpen).toBe(true)
    expect(settings.isOpen).toBe(false)

    expect(shell.showPanel('notes')).toBe(null)
    expect(notes.isOpen).toBe(false)
    expect(document.body.classList.contains('has-panel')).toBe(false)
    expect(document.body.dataset.panel).toBeUndefined()
    shell.destroy()
  })
})
