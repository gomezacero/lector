const MAX_SHARDS = 8

export const normalizeWord = word => String(word ?? '')
  .normalize('NFC')
  .toLocaleLowerCase()
  .replace(/^[^\p{L}]+|[^\p{L}'’-]+$/gu, '')

const shardName = word => [...word].slice(0, 2).map(char => /\p{L}/u.test(char)
  ? char
  : `_u${char.codePointAt(0).toString(16)}_`).join('') || '_'

export function createDictionaryProvider ({
  baseUrl = '/src/dictionary/data',
  fetchImpl = (...args) => fetch(...args),
  maxShards = MAX_SHARDS
} = {}) {
  const cache = new Map()

  async function shard (language, prefix) {
    const key = `${language}/${prefix}`
    if (cache.has(key)) {
      const value = cache.get(key)
      cache.delete(key)
      cache.set(key, value)
      return value
    }
    let value = {}
    try {
      const response = await fetchImpl(`${baseUrl}/${language}/${prefix}.json`)
      if (response.ok) value = await response.json()
    } catch { /* un paquete ausente nunca provoca una descarga */ }
    cache.set(key, value)
    while (cache.size > maxShards) cache.delete(cache.keys().next().value)
    return value
  }

  async function inLanguage (word, language) {
    const prefix = shardName(word)
    const exact = await shard(language, prefix)
    const common = await shard(language, 'common')
    const entries = exact.entries ?? exact
    const commonEntries = common.entries ?? common
    let fallback = entries[word] ?? commonEntries[word]

    // Los diccionarios completos guardan flexiones como alias compactos. El
    // lema puede vivir en otro shard (por ejemplo «puede» -> «poder»).
    const alias = exact.aliases?.[word] ?? common.aliases?.[word]
    if (!fallback && alias) {
      const lemmaPrefix = shardName(alias)
      const lemmaShard = await shard(language, lemmaPrefix)
      fallback = (lemmaShard.entries ?? lemmaShard)[alias]
    }

    // Compatibilidad con los antiguos shards planos de desarrollo.
    fallback ??= [...Object.values(entries), ...Object.values(commonEntries)].find(entry =>
      entry?.forms?.some(form => normalizeWord(form) === word))
    return fallback ? { ...fallback, language } : null
  }

  return {
    async lookup (raw, preferredLanguage = 'es') {
      const word = normalizeWord(raw)
      if (!word || word.length > 200) return null
      const first = preferredLanguage === 'en' ? 'en' : 'es'
      return (await inLanguage(word, first)) ?? inLanguage(word, first === 'es' ? 'en' : 'es')
    },
    clear: () => cache.clear(),
    get cachedShards () { return cache.size }
  }
}
