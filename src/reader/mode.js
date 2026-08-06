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
  page: { id: 'page', label: 'Párrafo a párrafo', hint: 'Página original' }
}

// Un libro ilustrado trae figuras sueltas; uno tecnico, en casi todas las
// paginas. Y las columnas son una senal aun mas clara: la prosa no las usa.
const FIGURE_SHARE = 0.15
const COLUMN_SHARE = 0.3

/**
 * @param {Object} book
 * @returns {{mode:'flow'|'page', figures:number, columns:number, why:string}}
 */
export function detectMode (book) {
  const pages = Math.max(1, book.pageCount)
  const figures = (book.stats?.figures ?? 0) / pages
  const columns = (book.stats?.columnPages ?? 0) / pages

  if (columns > COLUMN_SHARE) {
    return { mode: 'page', figures, columns, why: 'el texto va en columnas' }
  }
  if (figures > FIGURE_SHARE) {
    return { mode: 'page', figures, columns, why: 'tiene figuras en casi todas las páginas' }
  }
  return { mode: 'flow', figures, columns, why: 'es texto corrido' }
}

/** Modo a usar teniendo en cuenta lo que haya elegido el lector. */
export function resolveMode (book, preference) {
  return preference && preference !== 'auto' ? preference : detectMode(book).mode
}
