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
// Los seis ficheros por libro se borran juntos en removeLibraryEntry. Al
// anadir un septimo hay que anadirlo alli.
//
// Los de OCR y layout sobreviven a las subidas de version del cache a
// proposito: volver a procesar el libro relee lo ya reconocido y analizado en
// vez de pagar otra vez los minutos de modelo.

const userData = () => app.getPath('userData')
const booksDir = () => path.join(userData(), 'books')

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

  // Apagarla deja el texto entero y sin desenfoque, para leer de corrido.
  focusEnabled: true,
  theme: 'dark',
  fontFamily: 'Sitka Text',
  blurAmount: 2.4,
  dimOpacity: 0.34,
  focusLines: 1,
  falloffLines: 1.6,
  textAlign: 'left'
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

async function writeJson (file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}-${++tmpCounter}.tmp`
  try {
    await fs.writeFile(tmp, JSON.stringify(data), 'utf8')
    await fs.rename(tmp, file)
  } catch (err) {
    // El rename fallido deja el temporal escrito; se recoge aqui porque su
    // nombre solo se conoce en este ambito.
    await fs.rm(tmp, { force: true }).catch(() => {})
    throw err
  }
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
  return withLibraryLock(async () => {
    const list = await readLibrary()
    const i = list.findIndex(b => b.id === entry.id)
    if (i === -1) list.push(entry)
    else list[i] = { ...list[i], ...entry }
    await writeJson(path.join(userData(), 'library.json'), list)
    return list
  })
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
    bytes += await removeFile(coverPath(id))
    bytes += await removeTemporaries(booksDir(), [`${id}.json.`, `${id}.notes.json.`, `${id}.ocr.json.`, `${id}.layout.json.`])

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
export const writeBookCache = async (id, book) => writeJson(bookFile(id, '.json'), book)

export const readNotes = async id => readJson(bookFile(id, '.notes.json'), [])
export const writeNotes = async (id, notes) => writeJson(bookFile(id, '.notes.json'), notes)

export const readOcr = async id => readJson(bookFile(id, '.ocr.json'), null)
export const writeOcr = async (id, data) => writeJson(bookFile(id, '.ocr.json'), data)

export const readLayout = async id => readJson(bookFile(id, '.layout.json'), null)
export const writeLayout = async (id, data) => writeJson(bookFile(id, '.layout.json'), data)

export async function readSettings () {
  const saved = await readJson(path.join(userData(), 'settings.json'), {})
  return { ...DEFAULT_SETTINGS, ...saved }
}

export const writeSettings = s => writeJson(path.join(userData(), 'settings.json'), s)
