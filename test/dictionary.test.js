import { describe, it, expect, vi } from 'vitest'
import { readFile } from 'node:fs/promises'
import { createDictionaryProvider, normalizeWord } from '../src/dictionary/dictionaryProvider.js'

describe('RX-DICT-002 proveedor por shards', () => {
  it('normaliza, usa fallback de idioma y conserva cache LRU', async () => {
    const fetchImpl = vi.fn(async url => ({
      ok: true,
      json: async () => url.includes('/en/') ? { book: { lemma: 'book', definitions: ['work'], forms: ['books'] } } : {}
    }))
    const provider = createDictionaryProvider({ fetchImpl, maxShards: 8 })
    expect(normalizeWord(' «BOOK!» ')).toBe('book')
    expect(await provider.lookup('BOOK', 'es')).toMatchObject({ lemma: 'book', language: 'en' })
    const calls = fetchImpl.mock.calls.length
    await provider.lookup('book', 'es')
    expect(fetchImpl).toHaveBeenCalledTimes(calls)
    expect(provider.cachedShards).toBeLessThanOrEqual(8)
    expect(await provider.lookup('books', 'en')).toMatchObject({ lemma: 'book' })
  })

  it('un recurso ausente no intenta otra red ni lanza error', async () => {
    const provider = createDictionaryProvider({ fetchImpl: vi.fn(async () => { throw new Error('offline') }) })
    await expect(provider.lookup('desconocida')).resolves.toBeNull()
  })

  it('resuelve una forma flexionada mediante su lema en otro shard', async () => {
    const files = {
      '/dict/es/pu.json': { entries: {}, aliases: { puede: 'poder' } },
      '/dict/es/po.json': { entries: { poder: { lemma: 'poder', definitions: ['Tener capacidad.'] } }, aliases: {} }
    }
    const provider = createDictionaryProvider({
      baseUrl: '/dict',
      fetchImpl: async url => ({ ok: Boolean(files[url]), json: async () => files[url] })
    })
    expect(await provider.lookup('Puede', 'es')).toMatchObject({ lemma: 'poder' })
  })

  it('incluye una definicion real para «maravilla», la consulta reportada en la novela', async () => {
    const root = new URL('../src/dictionary/data/', import.meta.url)
    const provider = createDictionaryProvider({
      fetchImpl: async url => {
        try {
          const relative = String(url).replace('/src/dictionary/data/', '')
          const json = JSON.parse(await readFile(new URL(relative, root), 'utf8'))
          return { ok: true, json: async () => json }
        } catch {
          return { ok: false, json: async () => ({}) }
        }
      }
    })

    const entry = await provider.lookup('Maravilla', 'es')
    expect(entry).toMatchObject({ lemma: 'maravilla', language: 'es' })
    expect(entry.definitions[0]).toMatch(/impresionante|admiración/i)
  })
})
