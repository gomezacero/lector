// @vitest-environment jsdom

import { beforeEach, describe, it, expect, vi } from 'vitest'
import { createNotesStore } from '../src/notes/notesStore.js'

describe('NotesStore', () => {
  beforeEach(() => {
    window.lector = {
      notes: {
        read: vi.fn(async () => []),
        add: vi.fn(async () => {}),
        edit: vi.fn(async () => {}),
        remove: vi.fn(async () => {})
      },
      log: { error: vi.fn() }
    }
  })

  it('distingue el marcador reversible de un resaltado en el mismo offset', async () => {
    const store = createNotesStore('a'.repeat(32))
    await store.load()
    const marker = store.add({ offset: 12, block: 2, char: 4, quote: 'una linea' })
    store.add({ offset: 12, end: 30, block: 2, char: 4, quote: 'una cita', kind: 'highlight', color: 'yellow' })

    expect(store.findBookmark(12)).toBe(marker)
    expect(store.findBookmark({ offset: 15, block: 2, char: 4 })).toBe(marker)
    expect(store.findBookmark({ offset: 15, block: 2, char: 1, end: 8 })).toBe(marker)
    store.remove(marker.id)
    expect(store.findBookmark(12)).toBe(null)
    expect(store.all).toHaveLength(1)
    expect(store.all[0].kind).toBe('highlight')
  })
})
