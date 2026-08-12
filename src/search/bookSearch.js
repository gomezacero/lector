import { chapterAtOffset, percentAt } from '../reader/progress.js'

const MAX_RESULTS = 200

/** Normaliza y conserva el indice UTF-16 de cada caracter resultante. */
export function normalizeWithMap (text) {
  let normalized = ''
  const map = []
  let sourceIndex = 0
  for (const character of String(text ?? '')) {
    const folded = character.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase()
    for (const output of folded) {
      normalized += output
      map.push(sourceIndex)
    }
    sourceIndex += character.length
  }
  map.push(sourceIndex)
  return { normalized, map }
}

/** Indice local y efimero de los bloques normalizados. */
export function createBookSearchIndex (book) {
  const entries = []
  for (let blockIndex = 0; blockIndex < (book?.blocks?.length ?? 0); blockIndex++) {
    const block = book.blocks[blockIndex]
    if (!block?.text) continue
    entries.push({ block, blockIndex, ...normalizeWithMap(block.text) })
  }

  return indexFromEntries(book, entries)
}

function indexFromEntries (book, entries) {
  let cancelled = false
  return {
    cancel: () => { cancelled = true; entries.length = 0 },
    search (query, limit = MAX_RESULTS) {
      const needle = normalizeWithMap(String(query).slice(0, 256)).normalized.trim()
      if (cancelled || needle.length < 2) return []
      const results = []
      const cap = Math.max(1, Math.min(MAX_RESULTS, Number(limit) || MAX_RESULTS))
      for (const entry of entries) {
        let from = 0
        while (results.length < cap) {
          const found = entry.normalized.indexOf(needle, from)
          if (found === -1) break
          const localStart = entry.map[found] ?? 0
          const localEnd = entry.map[Math.min(entry.map.length - 1, found + needle.length)] ?? localStart
          const offset = entry.block.start + localStart
          results.push({
            locator: {
              offset,
              context: entry.block.text.slice(localStart, localStart + 200).trim(),
              page: entry.block.page
            },
            end: entry.block.start + localEnd,
            context: entry.block.text.slice(Math.max(0, localStart - 70),
              Math.min(entry.block.text.length, localEnd + 110)).replace(/\s+/g, ' ').trim(),
            chapter: chapterAtOffset(book, offset),
            page: entry.block.page,
            percent: percentAt(book, offset)
          })
          from = found + Math.max(1, needle.length)
        }
        if (results.length >= cap) break
      }
      return results
    }
  }
}

/** Construccion cooperativa para novelas extensas, registrable como tarea de sesión. */
export function createBookSearchTask (book, onReady) {
  let cancelled = false
  let building = []
  return {
    async start () {
      for (let blockIndex = 0; blockIndex < (book?.blocks?.length ?? 0); blockIndex++) {
        if (cancelled) return
        const block = book.blocks[blockIndex]
        if (block?.text) building.push({ block, blockIndex, ...normalizeWithMap(block.text) })
        if (blockIndex > 0 && blockIndex % 100 === 0) {
          await new Promise(resolve => setTimeout(resolve, 0))
        }
      }
      if (!cancelled) onReady(indexFromEntries(book, building))
      building = []
    },
    cancel () { cancelled = true; building = [] }
  }
}
