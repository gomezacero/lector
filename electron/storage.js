import { app } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { logLine } from './log.js'

// Todo el estado persistente vive bajo userData:
//   library.json          -> lista de libros con su progreso
//   settings.json         -> preferencias de lectura
//   books/<id>.json       -> cache del texto extraido de un PDF
//   books/<id>.notes.json -> marcadores y notas de ese libro
//   books/<id>.ocr.json   -> texto reconocido de un escaneado, pagina a pagina
//   books/<id>.layout.json-> cajas del modelo de layout, pagina a pagina
//   covers/<id>.jpg       -> portada ya dibujada para la estanteria
//
// Todos los ficheros por libro se borran juntos en removeLibraryEntry. Al
// anadir otro artefacto hay que incorporarlo alli, al uso y al respaldo.
//
// Los de OCR y layout sobreviven a las subidas de version del cache a
// proposito: volver a procesar el libro relee lo ya reconocido y analizado en
// vez de pagar otra vez los minutos de modelo.

const userData = () => app.getPath('userData')
const booksDir = () => path.join(userData(), 'books')
const MAX_JSON_CHARS = 256 * 1024 * 1024
const MAX_NOTES = 100_000

// Los id son 32 hex (sha256 recortado, electron/main.js). Llegan del renderer
// por IPC y acaban en path.join: cualquier otra cosa —un ../, mayusculas, un
// numero— podria salirse de userData con permiso de escritura y borrado, asi
// que aqui se corta antes de tocar ninguna ruta.
const ID_FORMAT = /^[0-9a-f]{32}$/
function assertId (id) {
  if (typeof id !== 'string' || !ID_FORMAT.test(id)) {
    throw new Error(`id de libro invalido: ${String(id).slice(0, 40)}`)
  }
}

// Avisos para el usuario (fichero corrupto apartado, etc.). El proceso
// principal los recoge con takeWarnings() y los reenvia a la ventana; ademas
// quedan en el log persistente.
let warnings = []
export const takeWarnings = () => warnings.splice(0)

function logError (message) {
  console.error(message)
  logLine('storage', message)
}

function warn (message) {
  warnings.push(message)
  logError(message)
}

// Los ajustes viven en dos ambitos.
//
// Los de lectura dependen de como este compuesto el documento: una novela pide
// letra grande y un articulo pide ampliacion, asi que se guardan con cada libro.
// Los demas son gusto del lector y no cambian de un libro a otro.
//
// Regla unica: los ajustes efectivos son los globales con encima los del libro.
// Los globales hacen ademas de punto de partida para cualquier libro nuevo.
//
// Cuales son los de lectura lo decide src/settings/settings.js, que es quien
// los reparte. Aqui solo se guardan: los del libro viajan dentro de su entrada
// de library.json, asi que se van con el al borrarlo.

export const DEFAULT_SETTINGS = {
  // auto | flow (re-maquetado, linea a linea) | page (pagina original, region a region)
  readingMode: 'auto',
  // En la vista de pagina: block (una parada por parrafo o figura) | lines
  // (por grupos de renglones, con focusLines diciendo cuantos).
  pageStop: 'block',
  pageZoom: 1,
  fontSize: 20,
  lineHeight: 1.75,
  columnWidth: 640,
  presentationMode: 'continuous',
  typographyPreset: 'novel',
  paragraphSpacing: 0.85,
  wordSpacing: 0,
  letterSpacing: 0,
  fontWeight: 400,
  verticalMargin: 48,

  // Apagarla deja el texto entero y sin desenfoque, para leer de corrido.
  focusEnabled: true,
  theme: 'dark',
  fontFamily: 'Source Serif 4',
  blurAmount: 2.4,
  dimOpacity: 0.34,
  focusLines: 1,
  falloffLines: 1.6,
  textAlign: 'left',
  motion: 'system',
  uiScale: 100,
  showProgress: true,
  showEta: true,
  // La guía muestra cuánto tiempo suele necesitar esta unidad. Sólo 'auto'
  // mueve el foco por sí sola; nunca se activa automáticamente.
  rhythmMode: 'guided',
  readingTargetWpm: 180,
  customBackground: '',
  customForeground: '',
  customAccent: '',
  speechRate: 1,
  speechLanguage: 'auto',
  speechVoiceEs: '',
  speechVoiceEn: '',
  speechTimer: 'off',
  breakInterval: 0,
  collectReadingStats: false,
  vocabularyHistory: false,
  gamepadEnabled: false,
  gamepadNextButton: 0,
  gamepadPreviousButton: 1,
  gamepadPageNextButton: 5,
  gamepadPagePreviousButton: 4,
  fullscreen: false,
  lastPanel: '',
  // Velocidad de lectura medida (caracteres por minuto). No sale en el panel:
  // la aplicacion la aprende sola y la usa para estimar lo que queda.
  paceCpm: 0
}

async function readJson (file, fallback) {
  let raw
  try {
    raw = await fs.readFile(file, 'utf8')
  } catch (err) {
    if (err.code === 'ENOENT') return fallback
    // Bloqueado o ilegible sin saber por que: mejor fallar alto que devolver
    // el fallback y que la siguiente escritura pise un fichero que quiza este
    // bien. El invoke del renderer vera el rechazo.
    warn(`No se pudo leer ${path.basename(file)}: ${err.message}`)
    throw err
  }
  try {
    return JSON.parse(raw)
  } catch {
    // Contenido dañado: se aparta con fecha en vez de dejarlo donde esta.
    // Devolver el fallback sin apartarlo seria fatal —el siguiente guardado
    // escribiria encima y una biblioteca entera se perderia en silencio—;
    // apartado, el guardado empieza de cero y los datos siguen recuperables.
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const saved = `${file}.corrupto-${stamp}`
    try {
      await fs.rename(file, saved)
    } catch (err) {
      warn(`${path.basename(file)} está dañado y no se pudo apartar: ${err.message}`)
      throw err
    }
    warn(`${path.basename(file)} estaba dañado; se guardó una copia como ${path.basename(saved)}.`)
    return fallback
  }
}

// Escritura atomica: un corte de luz a mitad no deja el JSON a medias.
//
// El temporal lleva nombre propio por dos razones medidas. La biblioteca se
// escribe desde tres sitios que se solapan —el autoguardado del lector, los
// ajustes del libro y el refresco de la estanteria—, y con un nombre fijo dos
// escrituras a la vez se pisan el mismo fichero. Y si el rename no llega a
// completarse, un temporal con nombre fijo se queda ahi para siempre: nadie
// recorre estos directorios buscandolo.
let tmpCounter = 0

// Toda escritura de un mismo recurso va en fila. library.json ya tenia una
// cola para proteger su leer-modificar-escribir; esta segunda capa cubre
// tambien notas, ajustes, OCR, layout y cache.
const fileQueues = new Map()

function withFileLock (file, fn) {
  const previous = fileQueues.get(file) ?? Promise.resolve()
  const run = previous.catch(() => {}).then(fn)
  fileQueues.set(file, run)
  run.finally(() => {
    if (fileQueues.get(file) === run) fileQueues.delete(file)
  }).catch(() => {})
  return run
}

function serializeJson (data) {
  const raw = JSON.stringify(data)
  if (raw.length > MAX_JSON_CHARS) throw new Error('datos demasiado grandes para guardar')
  return raw
}

async function writeJsonUnlocked (file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}-${++tmpCounter}.tmp`
  try {
    await fs.writeFile(tmp, serializeJson(data), 'utf8')
    await fs.rename(tmp, file)
  } catch (err) {
    // El rename fallido deja el temporal escrito; se recoge aqui porque su
    // nombre solo se conoce en este ambito.
    await fs.rm(tmp, { force: true }).catch(() => {})
    throw err
  }
}

const writeJson = (file, data) => withFileLock(file, () => writeJsonUnlocked(file, data))

async function updateJson (file, fallback, update) {
  return withFileLock(file, async () => {
    const current = await readJson(file, fallback)
    const next = await update(current)
    await writeJsonUnlocked(file, next)
    return next
  })
}

/** Espera todas las escrituras iniciadas, incluso las que fallaron. */
export async function flushWrites () {
  await Promise.allSettled([...fileQueues.values(), libraryQueue])
}

/** Los temporales de un id, incluidos los del esquema viejo de nombre fijo. */
async function removeTemporaries (dir, prefixes) {
  let names = []
  try {
    names = await fs.readdir(dir)
  } catch (err) {
    if (err.code !== 'ENOENT') logError(`No se pudo listar ${dir}: ${err.message}`)
    return 0
  }

  let bytes = 0
  for (const name of names) {
    if (!name.endsWith('.tmp')) continue
    if (!prefixes.some(prefix => name.startsWith(prefix))) continue
    bytes += await removeFile(path.join(dir, name))
  }
  return bytes
}

/** Borra y devuelve los bytes que ocupaba, 0 si no estaba. */
async function removeFile (file) {
  try {
    const { size } = await fs.stat(file)
    await fs.rm(file, { force: true })
    return size
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
    return 0
  }
}

// library.json se escribe desde tres sitios que se solapan (autoguardado del
// lector, ajustes del libro, refresco de la estanteria) y cada operacion es
// leer-modificar-escribir: dos a la vez se pierden cambios aunque la escritura
// en si sea atomica. La cola las pone en fila sin bloquear a nadie.
let libraryQueue = Promise.resolve()
function withLibraryLock (fn) {
  const run = libraryQueue.then(fn)
  libraryQueue = run.catch(() => {})
  return run
}

export async function readLibrary () {
  const list = await readJson(path.join(userData(), 'library.json'), [])
  return Array.isArray(list) ? list : []
}

export async function upsertLibraryEntry (entry) {
  assertId(entry?.id)
  assertLibraryEntry(entry)
  return withLibraryLock(async () => {
    const list = await readLibrary()
    const i = list.findIndex(b => b.id === entry.id)
    if (i === -1) list.push(entry)
    else list[i] = { ...list[i], ...entry }
    await writeJson(path.join(userData(), 'library.json'), list)
    return list
  })
}

export async function saveLibraryProgress (id, progress, lastOpenedAt) {
  assertId(id)
  assertProgress(progress)
  return upsertLibraryEntry({ id, progress, ...(finite(lastOpenedAt) ? { lastOpenedAt } : {}) })
}

export async function updateBookReading (id, reading, readingMode) {
  assertId(id)
  assertReading(reading, readingMode)
  return upsertLibraryEntry({ id, reading, readingMode })
}

/**
 * Borra un libro entero: sus ficheros primero y su entrada despues.
 *
 * Ese orden importa. Al reves, si la escritura de library.json fallara despues
 * de haber quitado la entrada, los ficheros quedarian sin nadie que los nombre
 * y ya no habria forma de alcanzarlos. Asi, un fallo a mitad deja el libro en
 * la estanteria sin su cache: molesto, pero se rehace solo al abrirlo.
 *
 * @returns {Promise<{ok:boolean, entries:Array, bytes:number, error?:string}>}
 */
export async function removeLibraryEntry (id) {
  assertId(id)
  let bytes = 0
  try {
    bytes += await removeFile(path.join(booksDir(), `${id}.json`))
    bytes += await removeFile(path.join(booksDir(), `${id}.notes.json`))
    bytes += await removeFile(path.join(booksDir(), `${id}.ocr.json`))
    bytes += await removeFile(path.join(booksDir(), `${id}.layout.json`))
    bytes += await removeFile(path.join(booksDir(), `${id}.vocabulary.json`))
    bytes += await removeFile(path.join(booksDir(), `${id}.stats.json`))
    bytes += await removeFile(coverPath(id))
    bytes += await removeTemporaries(booksDir(), [`${id}.json.`, `${id}.notes.json.`,
      `${id}.ocr.json.`, `${id}.layout.json.`, `${id}.vocabulary.json.`, `${id}.stats.json.`])

    const entries = await withLibraryLock(async () => {
      const kept = (await readLibrary()).filter(b => b.id !== id)
      await writeJson(path.join(userData(), 'library.json'), kept)
      return kept
    })
    return { ok: true, entries, bytes }
  } catch (err) {
    logError(`No se pudo borrar el libro ${id}: ${err.message}`)
    return { ok: false, entries: await readLibrary(), bytes, error: err.message }
  }
}

/**
 * Recoge cache y portadas que ya no pertenecen a ningun libro.
 *
 * Solo barre si la biblioteca se ha podido leer de verdad y no esta vacia. Un
 * library.json ilegible —bloqueado por el antivirus, a medio escribir, corrupto—
 * se lee hoy como lista vacia, y sin esta guarda el barrido entenderia que
 * ningun fichero tiene dueno y se llevaria la biblioteca entera por delante.
 */
export async function sweepOrphans () {
  let library
  try {
    library = JSON.parse(await fs.readFile(path.join(userData(), 'library.json'), 'utf8'))
  } catch {
    return { swept: 0, bytes: 0, skipped: 'biblioteca ilegible' }
  }
  if (!Array.isArray(library) || !library.length) {
    return { swept: 0, bytes: 0, skipped: 'biblioteca vacia' }
  }

  const known = new Set(library.map(b => b.id))
  // Un cache recien escrito puede no tener aun su entrada: se le da margen.
  const cutoff = Date.now() - 24 * 60 * 60 * 1000
  let swept = 0
  let bytes = 0

  for (const [dir, idOf] of [[booksDir(), booksFileId], [coversDir(), coversFileId]]) {
    let names = []
    try {
      names = await fs.readdir(dir)
    } catch { continue }

    for (const name of names) {
      const id = idOf(name)
      if (!id || known.has(id)) continue
      const file = path.join(dir, name)
      try {
        const { mtimeMs } = await fs.stat(file)
        if (mtimeMs > cutoff) continue
        bytes += await removeFile(file)
        swept++
      } catch (err) {
        logError(`No se pudo barrer ${file}: ${err.message}`)
      }
    }
  }

  // Temporales sueltos en la raiz: los que dejo el esquema anterior, cuando
  // todas las escrituras compartian el mismo nombre de temporal y una que no
  // llegaba a renombrarse se quedaba ahi sin que nadie volviera a mirarla.
  for (const name of await fs.readdir(userData()).catch(() => [])) {
    if (!name.endsWith('.tmp')) continue
    const file = path.join(userData(), name)
    try {
      if ((await fs.stat(file)).mtimeMs > cutoff) continue
      bytes += await removeFile(file)
      swept++
    } catch (err) {
      console.error(`No se pudo barrer ${file}:`, err.message)
    }
  }

  if (swept) console.log(`Barridos ${swept} ficheros huerfanos (${bytes} bytes)`)
  return { swept, bytes }
}

// <id>.json, <id>.notes.json y sus temporales pertenecen todos al mismo libro.
const booksFileId = name => name.match(/^([0-9a-f]{32})\./)?.[1] ?? null
const coversFileId = name => name.match(/^([0-9a-f]{32})\.jpg$/)?.[1] ?? null

const coversDir = () => path.join(userData(), 'covers')
export const coverPath = id => { assertId(id); return path.join(coversDir(), `${id}.jpg`) }

/**
 * Guarda la portada ya dibujada. Llega como bytes crudos desde el renderer.
 *
 * Va por temporal y rename como el resto: la portada se dibuja una sola vez, al
 * cerrar el libro, y hasCover() da por buena la que encuentre. Escribiendola
 * directamente, un corte a mitad dejaria una imagen rota que nadie volveria a
 * intentar.
 */
export async function writeCover (id, bytes) {
  const file = coverPath(id)
  await fs.mkdir(coversDir(), { recursive: true })
  const tmp = `${file}.${process.pid}-${++tmpCounter}.tmp`
  try {
    await fs.writeFile(tmp, Buffer.from(bytes))
    await fs.rename(tmp, file)
  } catch (err) {
    await fs.rm(tmp, { force: true }).catch(() => {})
    throw err
  }
}

/** Una portada de cero bytes es una portada a medias: mejor volver a dibujarla. */
export async function hasCover (id) {
  try {
    const { size } = await fs.stat(coverPath(id))
    return size > 0
  } catch {
    return false
  }
}

/**
 * Que se llevaria por delante borrar este libro. Se pregunta antes de borrar,
 * para poder decirlo en el aviso en vez de dar por hecho que da igual.
 * @returns {Promise<{bytes:number, notes:number}>}
 */
export async function bookUsage (id) {
  assertId(id)
  let bytes = 0
  for (const file of [
    path.join(booksDir(), `${id}.json`),
    path.join(booksDir(), `${id}.ocr.json`),
    path.join(booksDir(), `${id}.layout.json`),
    path.join(booksDir(), `${id}.vocabulary.json`),
    path.join(booksDir(), `${id}.stats.json`),
    coverPath(id)
  ]) {
    try {
      bytes += (await fs.stat(file)).size
    } catch { /* todavia no existe */ }
  }
  const notes = await readNotes(id)
  return { bytes, notes: Array.isArray(notes) ? notes.length : 0 }
}

// async y no arrow directo: assertId debe rechazar la promesa, no reventar al
// que llama en sincrono (el handler de IPC devuelve estas promesas tal cual).
const bookFile = (id, suffix) => { assertId(id); return path.join(booksDir(), `${id}${suffix}`) }

export const readBookCache = async id => readJson(bookFile(id, '.json'), null)
export const writeBookCache = async (id, book) => {
  assertBook(book)
  return writeJson(bookFile(id, '.json'), book)
}

export const readNotes = async id => readJson(bookFile(id, '.notes.json'), [])
export const writeNotes = async (id, notes) => {
  assertNotes(notes)
  return writeJson(bookFile(id, '.notes.json'), notes)
}

export async function addNote (id, note) {
  assertNote(note)
  const file = bookFile(id, '.notes.json')
  return updateJson(file, [], current => {
    const notes = Array.isArray(current) ? current : []
    if (!notes.some(saved => saved.id === note.id)) notes.push(note)
    assertNotes(notes)
    return notes.sort((a, b) => a.offset - b.offset)
  })
}

export async function editNote (id, noteId, text) {
  assertShortString(noteId, 'id de nota', 200)
  assertShortString(text, 'texto de nota', 100_000, true)
  const file = bookFile(id, '.notes.json')
  return updateJson(file, [], current => {
    const notes = Array.isArray(current) ? current : []
    const note = notes.find(saved => saved.id === noteId)
    if (note) note.text = text
    assertNotes(notes)
    return notes
  })
}

export async function removeNote (id, noteId) {
  assertShortString(noteId, 'id de nota', 200)
  const file = bookFile(id, '.notes.json')
  return updateJson(file, [], current =>
    (Array.isArray(current) ? current : []).filter(note => note.id !== noteId))
}

export const readOcr = async id => readJson(bookFile(id, '.ocr.json'), null)
export const writeOcr = async (id, data) => {
  assertPageStore(data, 'OCR')
  return writeJson(bookFile(id, '.ocr.json'), data)
}

export const readLayout = async id => readJson(bookFile(id, '.layout.json'), null)
export const writeLayout = async (id, data) => {
  assertPageStore(data, 'layout')
  return writeJson(bookFile(id, '.layout.json'), data)
}

export const readVocabulary = async id => readJson(bookFile(id, '.vocabulary.json'), [])
export async function addVocabulary (id, item) {
  assertVocabularyItem(item)
  const file = bookFile(id, '.vocabulary.json')
  return updateJson(file, [], current => {
    const items = (Array.isArray(current) ? current : [])
      .filter(saved => !(saved.word === item.word && saved.language === item.language))
    items.unshift(item)
    const limited = items.slice(0, 500)
    for (const saved of limited) assertVocabularyItem(saved)
    return limited
  })
}
export const clearVocabulary = async id => writeJson(bookFile(id, '.vocabulary.json'), [])

export const readReadingStats = async id => readJson(bookFile(id, '.stats.json'), null)
export const writeReadingStats = async (id, data) => {
  assertReadingStats(data)
  return writeJson(bookFile(id, '.stats.json'), data)
}
export const clearReadingStats = async id => removeFile(bookFile(id, '.stats.json'))

export async function readSettings () {
  const saved = await readJson(path.join(userData(), 'settings.json'), {})
  return { ...DEFAULT_SETTINGS, ...saved }
}

export const writeSettings = async s => {
  assertSettings(s)
  return writeJson(path.join(userData(), 'settings.json'), s)
}

const finite = value => typeof value === 'number' && Number.isFinite(value)
const plainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value))

function assertShortString (value, label, max, allowEmpty = false) {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.length)) {
    throw new TypeError(`${label} invalido`)
  }
}

function assertLibraryEntry (entry) {
  if (!plainObject(entry)) throw new TypeError('entrada de biblioteca invalida')
  for (const key of ['title', 'author', 'path']) {
    if (entry[key] != null) assertShortString(entry[key], key, key === 'path' ? 32_768 : 2_000, true)
  }
  if (entry.progress != null) assertProgress(entry.progress)
  if (entry.reading != null || entry.readingMode != null) assertReading(entry.reading ?? {}, entry.readingMode)
}

function assertProgress (progress) {
  if (!plainObject(progress) || !finite(progress.offset) || progress.offset < 0) {
    throw new TypeError('progreso invalido')
  }
  if (progress.percent != null && (!finite(progress.percent) || progress.percent < 0 || progress.percent > 1)) {
    throw new TypeError('porcentaje invalido')
  }
}

const READING_MODES = new Set(['auto', 'flow', 'sentence', 'page', null, undefined])
function assertReading (reading, mode) {
  if (!plainObject(reading) || !READING_MODES.has(mode)) throw new TypeError('ajustes de libro invalidos')
  for (const value of Object.values(reading)) {
    if (!['string', 'number', 'boolean'].includes(typeof value) || (typeof value === 'number' && !finite(value))) {
      throw new TypeError('valor de lectura invalido')
    }
  }
  if (reading.presentationMode != null && !['continuous', 'paged'].includes(reading.presentationMode)) {
    throw new TypeError('presentacion de lectura invalida')
  }
  if (reading.typographyPreset != null &&
      !['compact', 'novel', 'relaxed', 'legible', 'custom'].includes(reading.typographyPreset)) {
    throw new TypeError('preset tipografico invalido')
  }
  if (reading.lastPanel != null && !['', 'settings', 'notes', 'search'].includes(reading.lastPanel)) {
    throw new TypeError('panel de lectura invalido')
  }
}

function assertBook (book) {
  if (!plainObject(book) || !Number.isInteger(book.version) || !Array.isArray(book.blocks) ||
      !Array.isArray(book.chapters) || !Number.isInteger(book.pageCount) || !finite(book.chars)) {
    throw new TypeError('cache de libro invalida')
  }
}

function assertNote (note) {
  if (!plainObject(note) || !finite(note.offset) || note.offset < 0 || !Number.isInteger(note.block)) {
    throw new TypeError('nota invalida')
  }
  assertShortString(note.id, 'id de nota', 200)
  assertShortString(note.quote ?? '', 'cita', 2_000, true)
  assertShortString(note.text ?? '', 'texto de nota', 100_000, true)
}

function assertNotes (notes) {
  if (!Array.isArray(notes) || notes.length > MAX_NOTES) throw new TypeError('lista de notas invalida')
  for (const note of notes) assertNote(note)
}

function assertPageStore (data, label) {
  if (!plainObject(data) || !Number.isInteger(data.version) || !plainObject(data.pages)) {
    throw new TypeError(`${label} invalido`)
  }
}

function assertVocabularyItem (item) {
  if (!plainObject(item) || !finite(item.lookedUpAt)) throw new TypeError('entrada de vocabulario invalida')
  assertShortString(item.word, 'palabra', 200)
  assertShortString(item.lemma, 'lema', 200)
  if (!['es', 'en'].includes(item.language)) throw new TypeError('idioma de vocabulario invalido')
  if (item.locator != null) assertProgress(item.locator)
}

function assertReadingStats (data) {
  if (!plainObject(data) || !finite(data.activeMs) || data.activeMs < 0 ||
      !Number.isInteger(data.sessions) || data.sessions < 0 ||
      !Number.isInteger(data.breaks) || data.breaks < 0) {
    throw new TypeError('estadisticas de lectura invalidas')
  }
}

function assertSettings (settings) {
  if (!plainObject(settings)) throw new TypeError('ajustes invalidos')
  const allowed = new Set(Object.keys(DEFAULT_SETTINGS))
  for (const [key, value] of Object.entries(settings)) {
    if (!allowed.has(key) || !['string', 'number', 'boolean'].includes(typeof value) ||
        (typeof value === 'number' && !finite(value))) throw new TypeError(`ajuste invalido: ${key}`)
  }
  if (settings.motion != null && !['system', 'reduce', 'full'].includes(settings.motion)) {
    throw new TypeError('ajuste invalido: motion')
  }
  if (settings.theme != null && !['dark', 'light', 'sepia', 'contrast', 'custom'].includes(settings.theme)) {
    throw new TypeError('ajuste invalido: theme')
  }
  if (settings.uiScale != null && (settings.uiScale < 100 || settings.uiScale > 200)) {
    throw new TypeError('ajuste invalido: uiScale')
  }
  if (settings.speechRate != null && (settings.speechRate < 0.7 || settings.speechRate > 2)) {
    throw new TypeError('ajuste invalido: speechRate')
  }
  if (settings.rhythmMode != null && !['off', 'guided', 'auto'].includes(settings.rhythmMode)) {
    throw new TypeError('ajuste invalido: rhythmMode')
  }
  if (settings.readingTargetWpm != null &&
      (settings.readingTargetWpm < 40 || settings.readingTargetWpm > 500)) {
    throw new TypeError('ajuste invalido: readingTargetWpm')
  }
  if (settings.speechLanguage != null && !['auto', 'es', 'en'].includes(settings.speechLanguage)) {
    throw new TypeError('ajuste invalido: speechLanguage')
  }
  if (settings.breakInterval != null && ![0, 20, 30, 40].includes(settings.breakInterval)) {
    throw new TypeError('ajuste invalido: breakInterval')
  }
  for (const key of ['customBackground', 'customForeground', 'customAccent']) {
    if (settings[key] != null && settings[key] !== '' && !/^#[0-9a-f]{6}$/i.test(settings[key])) {
      throw new TypeError(`ajuste invalido: ${key}`)
    }
  }
}
