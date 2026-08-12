import { toLocator } from '../contracts/models.js'

/**
 * @typedef {Object} ReaderController
 * @property {(book:Object, locator:Object|null, notes:Object, bytes:Uint8Array, unit?:string)=>Promise<void>} open
 * @property {()=>void|Promise<void>} close
 * @property {(delta:number)=>void|Promise<void>} move
 * @property {(direction:number)=>void|Promise<void>} page
 * @property {(direction:number)=>void|Promise<void>} chapter
 * @property {(locator:Object|number, options?:Object)=>void|Promise<void>} goToLocator
 * @property {()=>Object} getLocator
 * @property {()=>Object|null} getCurrentExcerpt
 * @property {(listener:(event:Object)=>void)=>()=>void} subscribe
 * @property {(presentation:'continuous'|'paged')=>void|Promise<void>} setPresentation
 * @property {()=>{textSelection:boolean,reflowPagination:boolean,speech:boolean}} getCapabilities
 * @property {(settings:Object)=>void} setFocusSettings
 * @property {()=>void|Promise<void>} relayout
 * @property {()=>void|Promise<void>} flush
 */

/**
 * Falla al arrancar, no a mitad de una sesion, si un lector nuevo no respeta
 * la interfaz comun de flujo y pagina.
 * @param {Record<string, any>} reader
 * @returns {ReaderController}
 */
export function assertReaderController (reader) {
  const methods = [
    'open', 'close', 'move', 'page', 'chapter', 'goToLocator',
    'getLocator', 'getCurrentExcerpt', 'subscribe', 'setPresentation',
    'getCapabilities', 'setFocusSettings', 'relayout', 'flush'
  ]
  for (const method of methods) {
    if (typeof reader?.[method] !== 'function') {
      throw new TypeError(`lector invalido: falta ${method}()`)
    }
  }
  return /** @type {ReaderController} */ (reader)
}

/** @param {Object|number|null|undefined} locator */
export const offsetFromLocator = locator => toLocator(locator).offset
