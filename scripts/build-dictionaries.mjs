// Convierte JSONL normalizado a shards reproducibles. No descarga nada: el
// release proporciona entradas fijadas y verificadas legalmente.
// Uso: node scripts/build-dictionaries.mjs es entradas.jsonl salida/es

import { createReadStream } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { createHash } from 'node:crypto'
import path from 'node:path'

const [, , language, input, output] = process.argv
if (!['es', 'en'].includes(language) || !input || !output) {
  throw new Error('uso: node scripts/build-dictionaries.mjs <es|en> <entrada.jsonl> <salida>')
}
const shards = new Map()
for await (const line of createInterface({ input: createReadStream(input), crlfDelay: Infinity })) {
  if (!line.trim()) continue
  const entry = JSON.parse(line)
  const lemma = String(entry.lemma ?? '').normalize('NFC').toLocaleLowerCase()
  if (!lemma || !Array.isArray(entry.definitions) || !entry.definitions.length) continue
  const payload = {
    lemma: entry.lemma,
    partOfSpeech: entry.partOfSpeech ?? '',
    definitions: entry.definitions.slice(0, 12),
    forms: Array.isArray(entry.forms) ? entry.forms.slice(0, 40) : [],
    pronunciation: entry.pronunciation ?? ''
  }
  for (const raw of [lemma, ...(payload.forms ?? [])]) {
    const key = String(raw).normalize('NFC').toLocaleLowerCase()
    if (!key) continue
    const prefix = [...key].slice(0, 2).join('') || '_'
    if (!shards.has(prefix)) shards.set(prefix, {})
    shards.get(prefix)[key] = payload
  }
}
await mkdir(output, { recursive: true })
const checksums = {}
for (const prefix of [...shards.keys()].sort()) {
  const raw = `${JSON.stringify(shards.get(prefix))}\n`
  await writeFile(path.join(output, `${prefix}.json`), raw)
  checksums[prefix] = createHash('sha256').update(raw).digest('hex')
}
await writeFile(path.join(output, 'checksums.json'), `${JSON.stringify({ language, checksums }, null, 2)}\n`)
