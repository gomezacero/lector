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
    await store.writeBookCache(ID_A, { version: 1, text: 'hola' })
    expect(await store.readBookCache(ID_A)).toEqual({ version: 1, text: 'hola' })
  })
})
