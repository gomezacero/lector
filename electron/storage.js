import { app } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'

// Todo el estado persistente vive bajo userData:
//   library.json          -> lista de libros con su progreso
//   settings.json         -> preferencias de lectura
//   books/<id>.json       -> cache del texto extraido de un PDF
//   books/<id>.notes.json -> marcadores y notas de ese libro

const userData = () => app.getPath('userData')
const booksDir = () => path.join(userData(), 'books')

export const DEFAULT_SETTINGS = {
  // auto | flow (re-maquetado, linea a linea) | page (pagina original, region a region)
  readingMode: 'auto',
  pageZoom: 1,
  theme: 'dark',
  fontFamily: 'Sitka Text',
  fontSize: 20,
  lineHeight: 1.75,
  columnWidth: 640,
  blurAmount: 2.4,
  dimOpacity: 0.34,
  focusLines: 1,
  falloffLines: 1.6,
  textAlign: 'left'
}

async function readJson (file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'))
  } catch (err) {
    if (err.code !== 'ENOENT') console.error(`No se pudo leer ${file}:`, err.message)
    return fallback
  }
}

// Escritura atomica: un corte de luz a mitad no deja el JSON a medias.
async function writeJson (file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  await fs.writeFile(tmp, JSON.stringify(data), 'utf8')
  await fs.rename(tmp, file)
}

export async function readLibrary () {
  const list = await readJson(path.join(userData(), 'library.json'), [])
  return Array.isArray(list) ? list : []
}

export async function upsertLibraryEntry (entry) {
  const list = await readLibrary()
  const i = list.findIndex(b => b.id === entry.id)
  if (i === -1) list.push(entry)
  else list[i] = { ...list[i], ...entry }
  await writeJson(path.join(userData(), 'library.json'), list)
  return list
}

export async function removeLibraryEntry (id) {
  const list = (await readLibrary()).filter(b => b.id !== id)
  await writeJson(path.join(userData(), 'library.json'), list)
  await fs.rm(path.join(booksDir(), `${id}.json`), { force: true })
  await fs.rm(path.join(booksDir(), `${id}.notes.json`), { force: true })
  return list
}

export const readBookCache = id => readJson(path.join(booksDir(), `${id}.json`), null)
export const writeBookCache = (id, book) => writeJson(path.join(booksDir(), `${id}.json`), book)

export const readNotes = id => readJson(path.join(booksDir(), `${id}.notes.json`), [])
export const writeNotes = (id, notes) => writeJson(path.join(booksDir(), `${id}.notes.json`), notes)

export async function readSettings () {
  const saved = await readJson(path.join(userData(), 'settings.json'), {})
  return { ...DEFAULT_SETTINGS, ...saved }
}

export const writeSettings = s => writeJson(path.join(userData(), 'settings.json'), s)
