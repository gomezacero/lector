// Donde se quedo la lectura.
//
// El punto se guarda como offset de caracter dentro del libro, nunca como
// numero de linea: las lineas dependen de la fuente, del cuerpo y del ancho de
// la ventana, y cambian en cuanto se toca un ajuste. Los caracteres no.

import { lineAtOffset } from './lineIndex.js'

/** Bloque que contiene un offset global. Busqueda binaria sobre block.start. */
export function blockAtOffset (book, offset) {
  const blocks = book.blocks
  if (!blocks.length) return 0

  let lo = 0
  let hi = blocks.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (blocks[mid].start <= offset) lo = mid
    else hi = mid - 1
  }
  return lo
}

export function chapterAtOffset (book, offset) {
  const block = blockAtOffset(book, offset)
  const index = book.chapters.findIndex(c => block >= c.start && block < c.end)
  return index === -1 ? 0 : index
}

/**
 * Donde se posa la lectura la primera vez: el principio del libro de verdad, no
 * la cubierta. Lo anterior sigue estando, a un gesto y en el indice de capitulos.
 */
export function startOffset (book) {
  return book.blocks?.[book.bodyStart ?? 0]?.start ?? 0
}

/**
 * El porcentaje mide el libro, no el fichero.
 *
 * Se descuentan los preliminares —cubierta, creditos, indice— porque contarlos
 * hace que el capitulo primero empiece marcando un 36 %, como pasa en "Fisica
 * biologica". El material del final si cuenta: descontarlo tambien dejaria el
 * indice alfabetico de un manual marcando 100 % durante sus ultimas treinta
 * paginas, que miente mas de lo que arregla.
 */
export function percentAt (book, offset) {
  const from = startOffset(book)
  const total = book.chars - from
  if (total <= 0) return 0
  return Math.max(0, Math.min(1, (offset - from) / total))
}

/** Estado a persistir para el libro abierto. */
export function makeProgress (book, offset) {
  return {
    offset,
    percent: percentAt(book, offset),
    chapter: chapterAtOffset(book, offset),
    updatedAt: Date.now()
  }
}

/** Linea del capitulo ya medido que corresponde a un offset guardado. */
export function lineForOffset (book, lines, offset) {
  return lineAtOffset(lines, book.blocks, offset)
}
