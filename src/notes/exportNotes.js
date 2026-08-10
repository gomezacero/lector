// Citas y notas -> Markdown. Lo que uno se lleva del libro, en un formato que
// cualquier editor y cualquier gestor de apuntes entienden.
//
// Modulo puro: entra el libro y sus notas, sale el texto (o null si no hay
// nada que exportar). Guardarlo en disco es cosa del proceso principal.

import { blockAtOffset, chapterAtOffset } from '../reader/progress.js'

/**
 * @param {Object} book
 * @param {Array} notes marcadores, notas y resaltados, en orden de offset
 * @returns {string|null}
 */
export function exportNotesMarkdown (book, notes) {
  if (!notes.length) return null

  const lines = [`# ${book.title}`.trim()]
  if (book.author) lines.push('', `*${book.author}*`)

  let lastChapter = -1
  for (const note of [...notes].sort((a, b) => a.offset - b.offset)) {
    const chapter = chapterAtOffset(book, note.offset)
    if (chapter !== lastChapter) {
      lastChapter = chapter
      lines.push('', `## ${book.chapters[chapter]?.title ?? 'Sin capítulo'}`)
    }

    const page = (book.blocks[blockAtOffset(book, note.offset)]?.page ?? 0) + 1
    lines.push('')
    if (note.quote) lines.push(`> ${note.quote.replace(/\s+/g, ' ').trim()}`)
    lines.push(`— p. ${page}`)
    if (note.text?.trim()) lines.push('', note.text.trim())
  }

  lines.push('')
  return lines.join('\n')
}
