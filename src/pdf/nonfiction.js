// Reconstrucción de libros prácticos y de no ficción sin índice PDF.
//
// Las digitalizaciones OCR suelen perder la jerarquía tipográfica: una línea
// corriente de 9 pt dentro de prosa de 8 pt parece un título, mientras que el
// título real puede conservar exactamente el mismo cuerpo. En cambio, la
// secuencia editorial «PRIMERA PARTE → 1 → TÍTULO» sobrevive muy bien. Este
// módulo usa esa gramática sólo cuando aparece repetida y coherente; si no,
// no toca el libro.

const PART = /^(primera|segunda|tercera|cuarta|quinta|sexta|s[eé]ptima|octava|novena|d[eé]cima)\s+parte$/iu
const TOC_PART = /^(primera|segunda|tercera|cuarta|quinta|sexta|s[eé]ptima|octava|novena|d[eé]cima)\s+parte\b/iu
const NUMBER = /^(\d{1,2})\.?$/u
const AUXILIARY_ROLES = new Set(['cover', 'credits', 'toc', 'reference'])

const FRONT_MATTER = [
  { pattern: /^ocho\s+obj\s*etivos\b/u, title: 'Ocho objetivos que este libro le ayudará a lograr' },
  { pattern: /^prefacio\b/u, title: 'Prefacio a la edición revisada' },
  { pattern: /^como\s+fue\s+escrito\s+este\s+libro\b/u, title: 'Cómo fue escrito este libro... y por qué' },
  { pattern: /^nueve\s+sugerencias\b/u, title: 'Nueve sugerencias para aprovechar mejor este libro' }
]

const SUPPLEMENTS = [
  { pattern: /^un\s+breve\s+camino\s+hacia\s+la\s+distincion\b/u, title: 'Un breve camino hacia la distinción — Lowell Thomas' },
  { pattern: /^cursos\s+dale\s+carnegie$/u, title: 'Cursos Dale Carnegie' },
  { pattern: /^experiencias\s+personales\b/u, title: 'Experiencias personales' }
]

const normalized = value => String(value ?? '')
  .normalize('NFD')
  .replace(/\p{M}/gu, '')
  .toLocaleLowerCase('es')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim()

function uppercaseTitle (text) {
  const letters = text.match(/\p{L}/gu)?.length ?? 0
  if (letters < 4 || text.length > 190) return false
  const lowercase = text.match(/\p{Ll}/gu)?.length ?? 0
  return lowercase <= Math.max(1, letters * 0.12)
}

function displayTitle (text) {
  const clean = String(text ?? '').trim().replace(/^[“”"']+|[“”"']+$/gu, '')
  if (!uppercaseTitle(clean)) return clean
  const lower = clean.toLocaleLowerCase('es')
  return lower.replace(/^\p{L}/u, letter => letter.toLocaleUpperCase('es'))
}

const compact = text => normalized(text).replace(/\s+/gu, '')

function preferTocSpelling (visible, toc) {
  return toc && compact(visible) === compact(toc) ? toc : visible
}

function tocStructure (blocks) {
  const start = blocks.findIndex(block => block.role === 'toc' && /^(indice|contenido|sumario)$/u.test(normalized(block.text)))
  const groups = new Map()
  if (start < 0) return groups
  let current = null
  for (let i = start + 1; i < blocks.length; i++) {
    const block = blocks[i]
    if (block.role !== 'toc') continue
    const part = block.text.trim().match(TOC_PART)
    if (part) {
      current = normalized(part[1])
      const rest = block.text.trim().slice(part[0].length).replace(/^\s*[:—-]?\s*/u, '')
      groups.set(current, {
        label: `${displayTitle(part[1])} parte${rest ? ` — ${displayTitle(rest)}` : ''}`,
        titles: new Map()
      })
    }
    if (!current) continue
    for (const entry of block.text.matchAll(/(?:^|\s)(\d{1,2})\.\s+(.+?)(?=\s+\d{1,2}\.\s+|$)/gu)) {
      groups.get(current)?.titles.set(Number(entry[1]), entry[2].trim())
    }
  }
  return groups
}

const yOf = block => Number(block?.rects?.[0]?.y ?? 0)

function titleAfter (blocks, numberIndex) {
  const page = blocks[numberIndex]?.page
  const indexes = []
  for (let i = numberIndex + 1; i < blocks.length && indexes.length < 3; i++) {
    const block = blocks[i]
    if (block.page !== page || AUXILIARY_ROLES.has(block.role)) break
    if (!uppercaseTitle(block.text)) break
    indexes.push(i)
  }
  if (!indexes.length) return null
  return {
    indexes,
    text: indexes.map(index => blocks[index].text.trim()).join(' ')
  }
}

function partLabel (blocks, part, firstNumber) {
  const pieces = [blocks[part.index].text.trim()]
  for (let i = part.index + 1; i < firstNumber.index; i++) {
    if (blocks[i].page !== blocks[part.index].page || !uppercaseTitle(blocks[i].text)) continue
    pieces.push(blocks[i].text.trim())
  }
  return pieces.map(displayTitle).join(' — ')
}

function findSupplementMarks (blocks, from) {
  const marks = []
  for (let i = from; i < blocks.length; i++) {
    const key = normalized(blocks[i].text)
    const match = SUPPLEMENTS.find(item => item.pattern.test(key))
    if (match) marks.push({ index: i, title: match.title })
  }
  return marks
}

function findFrontMarks (blocks, from, to) {
  const marks = []
  for (let i = from; i < to; i++) {
    const key = normalized(blocks[i].text)
    const match = FRONT_MATTER.find(item => item.pattern.test(key))
    if (match) marks.push({ index: i, title: match.title })
  }
  return marks
}

/**
 * @returns {{blocks:Array,chapters:Array,bodyStart:number,bodyEnd:number}|null}
 */
export function refineStructuredNonfiction (book) {
  const blocks = book?.blocks ?? []
  if (blocks.length < 20) return null

  const parts = []
  for (let i = 0; i < blocks.length; i++) {
    const match = blocks[i].text.trim().match(PART)
    if (!AUXILIARY_ROLES.has(blocks[i].role) && match) {
      parts.push({ index: i, ordinal: normalized(match[1]) })
    }
  }
  if (parts.length < 2) return null

  const groups = []
  for (let p = 0; p < parts.length; p++) {
    const from = parts[p].index + 1
    const to = parts[p + 1]?.index ?? blocks.length
    const candidates = []
    for (let i = from; i < to; i++) {
      const match = blocks[i].text.trim().match(NUMBER)
      // El pie se elimina antes, pero el límite evita que un cache o fixture
      // antiguo convierta el folio inferior en capítulo.
      if (!match || yOf(blocks[i]) >= 740) continue
      const title = titleAfter(blocks, i)
      if (title) candidates.push({ index: i, number: Number(match[1]), ...title })
    }

    const sequence = []
    let expected = 1
    for (const candidate of candidates) {
      if (candidate.number !== expected) continue
      sequence.push(candidate)
      expected++
    }
    if (sequence.length >= 2) groups.push({ part: parts[p], chapters: sequence })
  }

  if (groups.length < 2 || groups.reduce((sum, group) => sum + group.chapters.length, 0) < 4) {
    return null
  }

  const real = []
  const headingIndexes = new Set()
  const textCorrections = new Map()
  const toc = tocStructure(blocks)
  for (const group of groups) {
    const visiblePart = partLabel(blocks, group.part, group.chapters[0])
    const tocPart = toc.get(group.part.ordinal)?.label
    const part = preferTocSpelling(visiblePart, tocPart)
    headingIndexes.add(group.part.index)
    const subtitleIndexes = []
    for (let i = group.part.index + 1; i < group.chapters[0].index; i++) {
      if (blocks[i].page === blocks[group.part.index].page && uppercaseTitle(blocks[i].text)) {
        headingIndexes.add(i)
        subtitleIndexes.push(i)
      }
    }
    if (tocPart && part === tocPart && subtitleIndexes.length === 1 && tocPart.includes('—')) {
      const subtitle = tocPart.split('—').slice(1).join('—').trim()
      textCorrections.set(subtitleIndexes[0], subtitle.toLocaleUpperCase('es'))
    }
    group.chapters.forEach((chapter, index) => {
      headingIndexes.add(chapter.index)
      chapter.indexes.forEach(value => headingIndexes.add(value))
      const visibleTitle = displayTitle(chapter.text)
      const tocTitle = toc.get(group.part.ordinal)?.titles.get(chapter.number)
      const preferredTitle = preferTocSpelling(visibleTitle, tocTitle)
      if (tocTitle && preferredTitle === tocTitle && chapter.indexes.length === 1) {
        textCorrections.set(chapter.indexes[0], uppercaseTitle(blocks[chapter.indexes[0]].text)
          ? tocTitle.toLocaleUpperCase('es')
          : tocTitle)
      }
      real.push({
        title: `${chapter.number}. ${displayTitle(preferredTitle)}`,
        part,
        start: index === 0 ? group.part.index : chapter.index
      })
    })
  }

  const supplementMarks = findSupplementMarks(blocks, real.at(-1).start + 1)
  const bodyEnd = supplementMarks[0]?.index ?? blocks.length
  const detectedStart = Math.max(0, Math.min(book.bodyStart ?? 0, real[0].start))
  const frontMarks = findFrontMarks(blocks, detectedStart, real[0].start)
  // Un crédito editorial que precede al primer preliminar sigue accesible con
  // Inicio, pero no es donde una persona quiere comenzar su sesión.
  const bodyStart = frontMarks[0]?.index ?? detectedStart

  const chapters = []
  if (frontMarks.length) {
    frontMarks.forEach((mark, index) => {
      headingIndexes.add(mark.index)
      textCorrections.set(mark.index, uppercaseTitle(blocks[mark.index].text)
        ? mark.title.toLocaleUpperCase('es')
        : mark.title)
      chapters.push({
        title: mark.title,
        start: index === 0 ? bodyStart : mark.index,
        end: frontMarks[index + 1]?.index ?? real[0].start,
        kind: 'frontmatter'
      })
    })
  } else if (real[0].start > bodyStart) {
    chapters.push({ title: 'Antes de empezar', start: bodyStart, end: real[0].start, kind: 'frontmatter' })
  }

  real.forEach((chapter, index) => {
    chapters.push({
      ...chapter,
      end: real[index + 1]?.start ?? bodyEnd
    })
  })

  supplementMarks.forEach((mark, index) => {
    headingIndexes.add(mark.index)
    chapters.push({
      title: mark.title,
      start: mark.index,
      end: supplementMarks[index + 1]?.index ?? blocks.length,
      kind: 'supplement'
    })
  })

  // En un documento que activó esta gramática, las cabeceras débiles son el
  // ruido OCR que originó la reconstrucción. Se conservan títulos en
  // mayúsculas y se promueven los que forman la jerarquía recuperada.
  const refinedBlocks = blocks.map((block, index) => ({
    ...block,
    text: textCorrections.get(index) ?? block.text,
    type: headingIndexes.has(index) || uppercaseTitle(block.text)
      ? 'heading'
      : (block.type === 'heading' ? 'paragraph' : block.type)
  }))

  return { blocks: refinedBlocks, chapters, bodyStart, bodyEnd }
}
