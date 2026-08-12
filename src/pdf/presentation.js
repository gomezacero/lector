// Ajustes editoriales derivados del Book ya extraido. No cambian bloques,
// texto ni offsets: corrigen como se presenta una novela cuando los metadatos
// del PDF y la estructura visual cuentan historias distintas.

import { refineStructuredNonfiction } from './nonfiction.js'

const AUXILIARY_ROLES = new Set(['cover', 'credits', 'toc', 'reference'])

const normalized = value => String(value ?? '')
  .normalize('NFD')
  .replace(/\p{M}/gu, '')
  .toLocaleLowerCase('es')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim()

const words = value => String(value ?? '').trim().split(/\s+/u).filter(Boolean)
const CONNECTOR = /^(?:de|del|la|las|los|y|e)$/iu

function looksLikePerson (text) {
  const tokens = words(text)
  if (tokens.length < 2 || tokens.length > 6) return false
  const names = tokens.filter(token => !CONNECTOR.test(token))
  if (names.length < 2) return false
  return names.every(token => /^\p{Lu}[\p{L}'’-]*$/u.test(token) || /^\p{Lu}+$/u.test(token))
}

function sentenceCaseIfUpper (text) {
  if (!text || /\p{Ll}/u.test(text)) return text
  const lower = text.toLocaleLowerCase('es')
  return lower.replace(/^\p{L}/u, letter => letter.toLocaleUpperCase('es'))
}

function nameCaseIfUpper (text) {
  if (!text || /\p{Ll}/u.test(text)) return text
  return words(text).map((token, index) => {
    const lower = token.toLocaleLowerCase('es')
    if (index > 0 && CONNECTOR.test(lower)) return lower
    return lower.replace(/^\p{L}/u, letter => letter.toLocaleUpperCase('es'))
  }).join(' ')
}

function restoreMetadataAccents (text, metadata) {
  const source = String(metadata ?? '').normalize('NFC').match(/\p{L}+/gu) ?? []
  const spellings = new Map(source.map(word => [normalized(word), word.normalize('NFC')]))
  return String(text ?? '').replace(/\p{L}+/gu, word => {
    const spelling = spellings.get(normalized(word))
    if (!spelling || spelling === word) return word
    const lower = spelling.toLocaleLowerCase('es')
    return /^\p{Lu}/u.test(word)
      ? lower.replace(/^\p{L}/u, letter => letter.toLocaleUpperCase('es'))
      : lower
  })
}

/** La portada suele saber mas que metadatos dejados por el creador del PDF. */
export function resolveBookIdentity ({ title = '', author = '', blocks = [], fileName = '' }) {
  const cover = blocks
    .filter(block => block.role === 'cover' && block.text && block.text.length <= 140)
    .map(block => block.text.trim())
    .filter(Boolean)

  const person = [...cover].reverse().find(looksLikePerson) ?? ''
  const catalogPerson = catalogAuthor(blocks) || fileNameAuthor(fileName)
  const titleKey = normalized(title)
  const singleTitle = cover
    .filter(text => text !== person && normalized(text).length >= 4)
    .filter(text => !titleKey || titleKey.includes(normalized(text)))
    .sort((a, b) => b.length - a.length)[0] ?? ''

  // Una portada suele repartir el título en dos o tres rótulos. Se prueban
  // prefijos contiguos antes del autor y se elige el más largo que también
  // figure en los metadatos; así no se incorpora el crédito del digitalizador.
  const beforePerson = person ? cover.slice(0, cover.indexOf(person)) : cover
  const leadingTitle = beforePerson.length > 1 && beforePerson.length <= 4 &&
    beforePerson.every(text => text.length <= 60)
    ? beforePerson.join(' ')
    : ''
  const joinedTitles = []
  for (let start = 0; start < beforePerson.length; start++) {
    for (let end = start + 1; end <= Math.min(beforePerson.length, start + 4); end++) {
      const candidate = beforePerson.slice(start, end).join(' ').trim()
      if (normalized(candidate).length >= 4 && (!titleKey || titleKey.includes(normalized(candidate)))) {
        joinedTitles.push(candidate)
      }
    }
  }
  const coverTitle = leadingTitle || joinedTitles.sort((a, b) => b.length - a.length)[0] || singleTitle

  const weakAuthor = words(author).length < 2 || /^(?:admin|usuario|user|patricio|autor)$/iu.test(author.trim())
  return {
    title: restoreMetadataAccents(sentenceCaseIfUpper(coverTitle), title) || title || fileName.replace(/\.pdf$/iu, '').trim() || 'Sin título',
    author: weakAuthor ? (person ? nameCaseIfUpper(person) : catalogPerson) : author
  }
}

// Fichas de bibliotecas digitales: "Hugo, Victor Novela" o
// "García Márquez, Gabriel Ensayo". El género final no forma parte del nombre.
function catalogAuthor (blocks) {
  const genres = 'novela|ensayo|poes[ií]a|cuento|teatro|drama|biograf[ií]a'
  for (const block of blocks) {
    if (block.role !== 'credits') continue
    const value = block.text.trim().replace(new RegExp(`\\s+(?:${genres})$`, 'iu'), '')
    const match = value.match(
      /^([\p{L}'’.-]+(?:\s+[\p{L}'’.-]+){0,3}),\s*([\p{L}'’.-]+(?:\s+[\p{L}'’.-]+){0,3})$/iu)
    if (match) return `${nameCaseIfUpper(match[2])} ${nameCaseIfUpper(match[1])}`
  }
  return ''
}

// Respaldo para portadas que son una sola imagen y no tienen ficha textual.
// Sólo se acepta el patrón editorial inequívoco "Título - Autor.pdf".
function fileNameAuthor (fileName) {
  const stem = String(fileName ?? '').replace(/\.pdf$/iu, '').replace(/\s*\(\d+\)\s*$/u, '')
  const parts = stem.split(/\s+-\s+/u)
  if (parts.length < 2) return ''
  const candidate = parts.at(-1).trim()
  return looksLikePerson(candidate) ? nameCaseIfUpper(candidate) : ''
}

function frontMatterTitle (blocks) {
  const readable = blocks.filter(block => !AUXILIARY_ROLES.has(block.role))
  const text = readable.map(block => block.text.trim()).filter(Boolean).join(' ')
  if (/^para\b/iu.test(text)) return 'Dedicatoria'
  if (readable.length && text.length <= 600 && /[«“”"].+[»“”"]/u.test(text)) return 'Epígrafe'
  return readable.length ? 'Antes de empezar' : 'Portada'
}

/** Primer bloque de un indice editorial situado al final, o blocks.length. */
export function findBodyEnd (blocks = []) {
  let end = blocks.length
  while (end > 0 && blocks[end - 1]?.role === 'toc') end--
  return end
}

/** Une rotulos de portada y separa el indice final del ultimo capitulo. */
export function refineChapters (chapters = [], blocks = [], bodyStart = 0) {
  if (!chapters.length || !blocks.length) return chapters
  const bodyEnd = findBodyEnd(blocks)

  const opening = openingTitleAt(blocks, bodyStart, bodyEnd)
  const structureless = chapters.every(chapter =>
    /^(?:Secci[oó]n \d+|Comienzo|Sin\s*t[ií]tulo.*|Untitled.*)$/iu.test(chapter.title) ||
    /\.pdf(?:\s|\(|$)/iu.test(chapter.title))
  if (opening && structureless) {
    const out = []
    if (bodyStart > 0) out.push({ title: 'Portada y créditos', start: 0, end: bodyStart, kind: 'frontmatter' })
    out.push({ title: opening.text, start: bodyStart, end: bodyEnd })
    return out
  }

  let firstContent = 0
  while (firstContent < chapters.length &&
         AUXILIARY_ROLES.has(blocks[chapters[firstContent].start]?.role)) firstContent++

  const out = []
  const firstStart = chapters[firstContent]?.start ?? bodyEnd
  if (firstStart > 0) {
    out.push({
      title: frontMatterTitle(blocks.slice(0, firstStart)),
      start: 0,
      end: firstStart,
      kind: 'frontmatter'
    })
  }

  for (const chapter of chapters.slice(firstContent)) {
    if (chapter.start >= bodyEnd) break
    out.push({ ...chapter, end: Math.min(chapter.end, bodyEnd) })
  }

  if (bodyEnd < blocks.length) {
    out.push({ title: 'Índice', start: bodyEnd, end: blocks.length, kind: 'supplement' })
  }
  return out.length ? out : chapters
}

function openingTitleAt (blocks, bodyStart, bodyEnd) {
  const first = blocks[bodyStart]
  const next = blocks[bodyStart + 1]
  if (!first || bodyStart >= bodyEnd || !next || first.page !== next.page) return null
  const text = first.text.trim()
  if (!text || text.length > 90 || /[.!?…:]$/u.test(text)) return null
  if (next.text.length < 140 || next.type !== 'paragraph') return null
  return first
}

function promoteOpeningTitle (blocks, bodyStart, bodyEnd) {
  const opening = openingTitleAt(blocks, bodyStart, bodyEnd)
  if (!opening || opening.type === 'heading') return blocks
  return blocks.map((block, index) => index === bodyStart ? { ...block, type: 'heading' } : block)
}

export function refineBookPresentation (book, { fileName = '', version = book.version } = {}) {
  const structured = refineStructuredNonfiction(book)
  const bodyEnd = structured?.bodyEnd ?? findBodyEnd(book.blocks)
  let chars = 0
  const refinedBlocks = structured
    ? structured.blocks.map(block => {
        const next = { ...block, start: chars }
        chars += next.text.length + 1
        return next
      })
    : promoteOpeningTitle(book.blocks, book.bodyStart ?? 0, bodyEnd)
  return {
    ...book,
    ...resolveBookIdentity({ title: book.title, author: book.author, blocks: book.blocks, fileName }),
    version,
    blocks: refinedBlocks,
    chars: structured ? chars : book.chars,
    chapters: structured?.chapters ?? refineChapters(book.chapters, refinedBlocks, book.bodyStart ?? 0),
    bodyStart: structured?.bodyStart ?? book.bodyStart,
    bodyEnd,
    stats: structured
      ? { ...book.stats, words: refinedBlocks.reduce((sum, block) => sum + (block.text.match(/\S+/gu)?.length ?? 0), 0) }
      : book.stats
  }
}
