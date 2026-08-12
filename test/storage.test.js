// El almacen del proceso principal, probado en Node puro: se le inyecta un
// userData temporal a traves del mock de electron.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

vi.mock('electron', () => ({
  app: { getPath: () => process.env.LECTOR_TEST_USERDATA }
}))

import * as store from '../electron/storage.js'

const ID_A = 'a'.repeat(32)
const ID_B = 'b'.repeat(32)

let base = null

beforeEach(async () => {
  base = await fs.mkdtemp(path.join(os.tmpdir(), 'lector-storage-'))
  process.env.LECTOR_TEST_USERDATA = base
  store.takeWarnings()
})

afterEach(async () => {
  await fs.rm(base, { recursive: true, force: true })
})

describe('biblioteca corrupta', () => {
  it('aparta un library.json ilegible en vez de sobrescribirlo', async () => {
    const corrupt = '{esto no es json'
    await fs.writeFile(path.join(base, 'library.json'), corrupt, 'utf8')

    await store.upsertLibraryEntry({ id: ID_A, title: 'A' })

    const names = await fs.readdir(base)
    const saved = names.find(n => n.startsWith('library.json.corrupto-'))
    expect(saved).toBeTruthy()
    expect(await fs.readFile(path.join(base, saved), 'utf8')).toBe(corrupt)

    const list = await store.readLibrary()
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe(ID_A)
  })

  it('deja un aviso recogible cuando encuentra un fichero corrupto', async () => {
    await fs.writeFile(path.join(base, 'library.json'), 'basura', 'utf8')

    await store.readLibrary()

    const warnings = store.takeWarnings()
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatch(/library\.json/)
    // Recoger vacia la lista: el aviso se muestra una sola vez.
    expect(store.takeWarnings()).toEqual([])
  })
})

describe('escrituras concurrentes', () => {
  it('dos upserts a la vez no se pisan', async () => {
    await Promise.all([
      store.upsertLibraryEntry({ id: ID_A, title: 'A' }),
      store.upsertLibraryEntry({ id: ID_B, title: 'B' })
    ])

    const list = await store.readLibrary()
    expect(list.map(b => b.id).sort()).toEqual([ID_A, ID_B])
  })

  it('serializa operaciones de notas del mismo libro', async () => {
    const note = {
      id: '0-1', offset: 0, block: 0, char: 0,
      quote: 'hola', text: '', createdAt: 1
    }
    await store.addNote(ID_A, note)
    await Promise.all([
      store.editNote(ID_A, note.id, 'comentario'),
      store.addNote(ID_A, { ...note, id: '5-2', offset: 5 })
    ])
    await store.flushWrites()

    const notes = await store.readNotes(ID_A)
    expect(notes).toHaveLength(2)
    expect(notes.find(saved => saved.id === note.id)?.text).toBe('comentario')
  })
})

describe('validacion de id', () => {
  const BAD_IDS = [
    '../evil',
    '..\\..\\evil',
    'A'.repeat(32), // mayusculas: fuera del formato
    'a'.repeat(31), // corto
    'a'.repeat(33), // largo
    '',
    null,
    42
  ]

  it('rechaza ids fuera del formato sin tocar el disco', async () => {
    for (const bad of BAD_IDS) {
      await expect(store.writeBookCache(bad, { x: 1 }), String(bad)).rejects.toThrow()
      await expect(store.readBookCache(bad), String(bad)).rejects.toThrow()
      await expect(store.writeNotes(bad, []), String(bad)).rejects.toThrow()
      await expect(store.writeOcr(bad, {}), String(bad)).rejects.toThrow()
      await expect(store.writeLayout(bad, {}), String(bad)).rejects.toThrow()
      await expect(store.writeCover(bad, new Uint8Array([1])), String(bad)).rejects.toThrow()
      await expect(store.removeLibraryEntry(bad), String(bad)).rejects.toThrow()
      await expect(store.bookUsage(bad), String(bad)).rejects.toThrow()
      await expect(store.upsertLibraryEntry({ id: bad }), String(bad)).rejects.toThrow()
    }
    // Nada se ha creado por el camino.
    const names = await fs.readdir(base)
    expect(names).toEqual([])
  })

  it('un id valido funciona de extremo a extremo', async () => {
    const book = {
      version: 10,
      title: 'Hola',
      author: '',
      pageCount: 1,
      chars: 4,
      blocks: [],
      chapters: [],
      pageSizes: [{ w: 600, h: 800 }],
      pageRoles: [null],
      pageKinds: ['text'],
      bodyStart: 0,
      stats: {}
    }
    await store.writeBookCache(ID_A, book)
    expect(await store.readBookCache(ID_A)).toEqual(book)
  })
})

describe('validacion de contratos persistidos', () => {
  it('rechaza estructuras y ajustes que no pertenecen al contrato', async () => {
    await expect(store.saveLibraryProgress(ID_A, { offset: -1 })).rejects.toThrow(/progreso/)
    await expect(store.writeSettings({ servidor: 'https://example.com' })).rejects.toThrow(/ajuste/)
    await expect(store.writeSettings({ motion: 'mareo' })).rejects.toThrow(/motion/)
    await expect(store.writeSettings({ breakInterval: 1 })).rejects.toThrow(/breakInterval/)
    await expect(store.writeSettings({ speechLanguage: 'fr' })).rejects.toThrow(/speechLanguage/)
    await expect(store.writeSettings({ customBackground: 'red' })).rejects.toThrow(/customBackground/)
    await expect(store.writeNotes(ID_A, [{ id: '', offset: 0, block: 0 }])).rejects.toThrow(/nota/)
    await expect(store.writeOcr(ID_A, { version: 1, pages: [] })).rejects.toThrow(/OCR/)
    await expect(store.writeBookCache(ID_A, { version: 10 })).rejects.toThrow(/cache/)
  })

  it('RX-DICT-005 limita vocabulario y RX-BREAK-003 valida estadisticas', async () => {
    await store.addVocabulary(ID_A, {
      word: 'novela', lemma: 'novela', language: 'es', lookedUpAt: 1, locator: { offset: 3 }
    })
    expect(await store.readVocabulary(ID_A)).toHaveLength(1)
    await expect(store.addVocabulary(ID_A, {
      word: 'x', lemma: 'x', language: 'xx', lookedUpAt: 1
    })).rejects.toThrow(/idioma/)

    await store.writeReadingStats(ID_A, { activeMs: 1000, sessions: 1, breaks: 0 })
    expect(await store.readReadingStats(ID_A)).toMatchObject({ activeMs: 1000 })
    await store.clearReadingStats(ID_A)
    expect(await store.readReadingStats(ID_A)).toBeNull()
  })
})
