// Estado y escrituras de una sesion de lectura. La UI puede cambiar de vista,
// pero progreso y ajustes siguen teniendo un unico dueno y un flush explicito.

import { toLocator } from '../contracts/models.js'

const SETTINGS_SAVE_DELAY = 400
const MAX_RETURN_POINTS = 20

/** @typedef {import('../contracts/models.js').LibraryEntry} LibraryEntry */
/** @typedef {import('../contracts/models.js').ReadingProgress} ReadingProgress */
/** @typedef {import('../contracts/models.js').Book} Book */
/**
 * @typedef {Object} LibraryPort
 * @property {(id:string,progress:ReadingProgress,lastOpenedAt?:number)=>Promise<unknown>} saveProgress
 * @property {(id:string,reading:Record<string,unknown>,mode?:string|null)=>Promise<unknown>} updateReading
 */
/** @typedef {{book:Book,bytes:Uint8Array,path?:string,layouts?:Object}} OpenDocument */

/** @param {{library:LibraryPort,saveDelay?:number}} options */
export function createBookSessionController ({ library, saveDelay = SETTINGS_SAVE_DELAY }) {
  /** @type {LibraryEntry|null} */
  let entry = null
  /** @type {OpenDocument|null} */
  let document = null
  let offset = 0
  /** @type {ReturnType<typeof setTimeout>|null} */
  let readingTimer = null
  /** @type {{id:string,reading:Record<string,unknown>,readingMode?:string|null}|null} */
  let readingPayload = null
  /** @type {Set<Promise<unknown>>} */
  const pending = new Set()
  /** @type {Array<import('../contracts/models.js').NavigationReturnPoint>} */
  let returnPoints = []

  /** @param {unknown|PromiseLike<unknown>} promise */
  const track = promise => {
    const wrapped = Promise.resolve(promise)
    pending.add(wrapped)
    wrapped.finally(() => pending.delete(wrapped)).catch(() => {})
    return wrapped
  }

  /** @param {LibraryEntry} nextEntry @param {OpenDocument} nextDocument */
  function open (nextEntry, nextDocument) {
    entry = nextEntry
    document = nextDocument
    offset = nextEntry?.progress?.offset ?? nextDocument?.book?.bodyStart ?? 0
    returnPoints = []
  }

  /** @param {Partial<LibraryEntry>} patch */
  function patchEntry (patch) {
    if (!entry) return null
    entry = { ...entry, ...patch }
    return entry
  }

  /** @param {ReadingProgress} progress */
  function saveProgress (progress) {
    if (!entry) return Promise.resolve(null)
    entry = { ...entry, progress }
    offset = progress.offset
    return track(library.saveProgress(entry.id, progress, entry.lastOpenedAt))
  }

  /** @param {Record<string,unknown>} reading */
  function scheduleReading (reading) {
    const current = entry
    if (!current) return
    const requestedMode = reading.readingMode
    const readingMode = typeof requestedMode === 'string'
      ? requestedMode
      : current.readingMode
    entry = {
      ...current,
      reading,
      readingMode
    }
    readingPayload = {
      id: current.id,
      reading,
      readingMode
    }
    if (readingTimer) clearTimeout(readingTimer)
    readingTimer = setTimeout(writeReading, saveDelay)
  }

  function writeReading () {
    if (readingTimer) clearTimeout(readingTimer)
    readingTimer = null
    if (!readingPayload) return Promise.resolve(null)
    const payload = readingPayload
    readingPayload = null
    return track(library.updateReading(payload.id, payload.reading, payload.readingMode))
  }

  async function flush () {
    await writeReading()
    await Promise.allSettled([...pending])
  }

  /**
   * Guarda de donde venia un salto deliberado. El avance corriente nunca llama
   * a este metodo y por tanto no contamina el historial de regreso.
   * @param {Object|number} locator
   * @param {string} origin
   */
  function rememberReturnPoint (locator, origin) {
    if (!entry) return
    const value = toLocator(locator)
    const previous = returnPoints.at(-1)
    if (previous?.locator?.offset === value.offset) return
    returnPoints.push({ locator: { ...value }, origin, createdAt: Date.now() })
    if (returnPoints.length > MAX_RETURN_POINTS) returnPoints.shift()
  }

  function takeReturnPoint () {
    return returnPoints.pop()?.locator ?? null
  }

  function clear () {
    if (readingTimer) clearTimeout(readingTimer)
    readingTimer = null
    readingPayload = null
    returnPoints = []
    entry = null
    document = null
    offset = 0
  }

  return {
    open,
    clear,
    flush,
    patchEntry,
    saveProgress,
    scheduleReading,
    rememberReturnPoint,
    takeReturnPoint,
    /** @param {OpenDocument} next */
    setDocument: next => { document = next },
    /** @param {number} next */
    setOffset: next => { offset = Math.max(0, Number(next) || 0) },
    get entry () { return entry },
    get document () { return document },
    get offset () { return offset },
    get canReturn () { return returnPoints.length > 0 },
    get returnDepth () { return returnPoints.length }
  }
}
