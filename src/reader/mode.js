// Con que vista se lee un documento.
//
// La prosa gana mucho re-maquetada: el texto se adapta a la pantalla y se
// avanza linea a linea. Un documento tecnico pierde con eso, porque las
// formulas, las tablas y las graficas se desmontan al re-maquetar; ahi conviene
// ensenar la pagina tal cual y resaltar una region entera cada vez.
//
// La regla vive aqui y no en la interfaz para que las herramientas de
// diagnostico juzguen un PDF exactamente igual que la aplicacion.

export const MODES = {
  flow: { id: 'flow', label: 'Línea a línea', hint: 'Texto re-maquetado' },
  sentence: { id: 'sentence', label: 'Frase a frase', hint: 'Texto re-maquetado' },
  page: { id: 'page', label: 'Párrafo a párrafo', hint: 'Página original' }
}

/** Los dos primeros re-maquetan el texto y comparten lector. */
export const isFlowMode = mode => mode === 'flow' || mode === 'sentence'

// Un libro ilustrado trae figuras sueltas; uno tecnico, en casi todas las
// paginas. Y las columnas son una senal aun mas clara: la prosa no las usa.
const FIGURE_SHARE = 0.15
const COLUMN_SHARE = 0.3

// Con mayoria de paginas que son pura imagen, el libro es un escaneado: no
// hay texto que re-maquetar y solo la pagina original ensena algo.
const SCANNED_SHARE = 0.5

/**
 * @param {Object} book
 * @returns {{mode:'flow'|'page', figures:number, columns:number, scanned:number, why:string}}
 */
export function detectMode (book) {
  const pages = Math.max(1, book.pageCount)
  const figures = (book.stats?.figures ?? 0) / pages
  const columns = (book.stats?.columnPages ?? 0) / pages
  const scanned = (book.stats?.scannedPages ?? 0) / pages

  if (scanned > SCANNED_SHARE) {
    return { mode: 'page', figures, columns, scanned, why: 'son páginas escaneadas' }
  }
  if (columns > COLUMN_SHARE) {
    return { mode: 'page', figures, columns, scanned, why: 'el texto va en columnas' }
  }
  if (figures > FIGURE_SHARE) {
    return { mode: 'page', figures, columns, scanned, why: 'tiene figuras en casi todas las páginas' }
  }
  return { mode: 'flow', figures, columns, scanned, why: 'es texto corrido' }
}

/** Modo a usar teniendo en cuenta lo que haya elegido el lector. */
export function resolveMode (book, preference) {
  // Sin texto reconocido no hay nada que re-maquetar: un escaneado solo tiene
  // vista de pagina, elija lo que elija el lector.
  if (book?.provisional) return 'page'
  return preference && preference !== 'auto' ? preference : detectMode(book).mode
}
