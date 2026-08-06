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

export function percentAt (book, offset) {
  if (!book.chars) return 0
  return Math.max(0, Math.min(1, offset / book.chars))
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
