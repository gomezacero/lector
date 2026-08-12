// Genera el diccionario espanol offline desde la extraccion JSONL comprimida
// de Wikcionario producida por Wiktextract/Kaikki. El dump fuente no se mete
// en la aplicacion: solo los campos necesarios para consultar una palabra.
//
// Uso:
//   node scripts/build-wiktionary-es.mjs dump.jsonl.gz src/dictionary/data/es

import { createReadStream } from 'node:fs'
import { mkdir, readdir, unlink, writeFile } from 'node:fs/promises'
import { createGunzip } from 'node:zlib'
import { createInterface } from 'node:readline'
import { createHash } from 'node:crypto'
import path from 'node:path'

const [, , input, output] = process.argv
if (!input || !output) throw new Error('uso: node scripts/build-wiktionary-es.mjs <dump.jsonl.gz> <salida>')

const normalize = word => String(word ?? '')
  .normalize('NFC')
  .toLocaleLowerCase('es')
  .replace(/^[^\p{L}]+|[^\p{L}'’-]+$/gu, '')

const prefixes = new Map()
const shardFor = word => {
  const prefix = [...word].slice(0, 2).map(char => /\p{L}/u.test(char)
    ? char
    : `_u${char.codePointAt(0).toString(16)}_`).join('') || '_'
  if (!prefixes.has(prefix)) prefixes.set(prefix, {
    entries: Object.create(null),
    aliases: Object.create(null)
  })
  return prefixes.get(prefix)
}
const setAlias = (form, lemma) => {
  const aliases = shardFor(form).aliases
  const current = aliases[form]
  // Una forma puede pertenecer a mas de un lema. Para una consulta breve es
  // preferible el lema mas cercano («maravillas» -> «maravilla», antes que
  // «maravillar»); las entradas lexicas exactas siempre tienen prioridad.
  if (!current || [...lemma].length < [...current].length) aliases[form] = lemma
}

let sourceEntries = 0
for await (const line of createInterface({
  input: createReadStream(input).pipe(createGunzip()),
  crlfDelay: Infinity
})) {
  if (!line.trim()) continue
  const raw = JSON.parse(line)
  if (raw.lang_code !== 'es') continue

  const lemmaKey = normalize(raw.word)
  // El dump contiene una pagina independiente para cada conjugacion. No
  // repetimos «Primera persona...» cientos de miles de veces: la forma apunta
  // al lema y la consulta devuelve su entrada lexica.
  if (!lemmaKey || /\s/u.test(lemmaKey)) continue
  const senses = raw.senses ?? []
  const lexicalSenses = senses.filter(sense =>
    !sense.form_of?.length && !sense.tags?.includes('form-of'))
  if (!lexicalSenses.length) {
    const target = senses.flatMap(sense => sense.form_of ?? []).map(item => normalize(item.word)).find(Boolean)
    if (target && target !== lemmaKey) setAlias(lemmaKey, target)
    continue
  }

  const definitions = lexicalSenses
    .flatMap(sense => sense.glosses ?? [])
    .map(text => String(text).trim())
    .filter(Boolean)
  if (!lemmaKey || !definitions.length) continue

  sourceEntries++
  const shard = shardFor(lemmaKey)
  const current = Object.hasOwn(shard.entries, lemmaKey) ? shard.entries[lemmaKey] : {
    lemma: raw.word,
    partOfSpeech: '',
    definitions: [],
    forms: [],
    pronunciation: ''
  }

  const parts = new Set(current.partOfSpeech.split(' · ').filter(Boolean))
  if (raw.pos_title || raw.pos) parts.add(raw.pos_title ?? raw.pos)
  current.partOfSpeech = [...parts].slice(0, 4).join(' · ')
  current.definitions = [...new Set([...current.definitions, ...definitions])].slice(0, 12)

  const allForms = (raw.forms ?? []).map(item => normalize(item.form)).filter(form => form && !/\s/u.test(form))
  const forms = allForms.slice(0, 40)
  current.forms = [...new Set([...current.forms, ...forms])].slice(0, 40)
  current.pronunciation ||= (raw.sounds ?? []).find(sound => sound.ipa)?.ipa ?? ''
  shard.entries[lemmaKey] = current

  for (const form of allForms) {
    if (form !== lemmaKey) setAlias(form, lemmaKey)
  }
}

await mkdir(output, { recursive: true })
// Esta carpeta es enteramente generada. Limpiamos solo JSON directos dentro
// del destino exacto, nunca directorios ni rutas calculadas fuera de el.
for (const file of await readdir(output)) {
  if (file.endsWith('.json')) await unlink(path.join(output, file))
}

const checksums = {}
let entries = 0
let aliases = 0
for (const prefix of [...prefixes.keys()].sort()) {
  const data = prefixes.get(prefix)
  data.entries = Object.fromEntries(Object.entries(data.entries).sort(([a], [b]) => a.localeCompare(b, 'es')))
  data.aliases = Object.fromEntries(Object.entries(data.aliases).sort(([a], [b]) => a.localeCompare(b, 'es')))
  entries += Object.keys(data.entries).length
  aliases += Object.keys(data.aliases).length
  const raw = `${JSON.stringify(data)}\n`
  await writeFile(path.join(output, `${prefix}.json`), raw)
  checksums[prefix] = createHash('sha256').update(raw).digest('hex')
}

const sourceHash = createHash('sha256')
for await (const chunk of createReadStream(input)) sourceHash.update(chunk)
await writeFile(path.join(output, 'checksums.json'), `${JSON.stringify({
  language: 'es',
  source: 'Kaikki eswiktionary raw Wiktextract JSONL',
  sourceSha256: sourceHash.digest('hex'),
  sourceEntries,
  entries,
  aliases,
  checksums
}, null, 2)}\n`)

console.log(JSON.stringify({ sourceEntries, entries, aliases, shards: prefixes.size }))
