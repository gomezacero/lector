// Contratos compartidos del dominio. Este archivo no crea objetos de negocio:
// documenta su forma y contiene las pocas conversiones que deben significar lo
// mismo en cualquier lector o formato.

/**
 * @typedef {'paragraph'|'heading'|'figure'} BlockType
 *
 * @typedef {Object} BookBlock
 * @property {BlockType|string} type
 * @property {string} text
 * @property {number} page indice de pagina, base cero
 * @property {number} start offset absoluto de caracteres
 * @property {{x:number,y:number,w:number,h:number}=} rect
 * @property {'native'|'ocr'=} source
 * @property {number=} confidence
 * @property {string=} role
 *
 * @typedef {Object} BookChapter
 * @property {string} title
 * @property {number} start indice de bloque inclusivo
 * @property {number} end indice de bloque exclusivo
 * @property {'frontmatter'|'supplement'=} kind seccion navegable que no cuenta como capitulo
 * @property {string=} part parte editorial a la que pertenece el capitulo
 *
 * @typedef {Object} Book
 * @property {number} version
 * @property {string} title
 * @property {string} author
 * @property {number} pageCount
 * @property {number} chars
 * @property {BookBlock[]} blocks
 * @property {BookChapter[]} chapters
 * @property {{w:number,h:number}[]} pageSizes
 * @property {(string|null)[]} pageRoles
 * @property {string[]} pageKinds
 * @property {number} bodyStart
 * @property {number=} bodyEnd primer bloque posterior a la obra legible
 * @property {boolean=} provisional
 * @property {Record<string, number|string>} stats
 *
 * @typedef {Object} ReadingLocator
 * @property {number} offset ancla canonica dentro del texto normalizado
 * @property {string=} context texto cercano que permite reanclar el punto
 * @property {number=} page pagina original, base cero
 *
 * @typedef {Object} ReadingProgress
 * @property {number} offset
 * @property {number} percent
 * @property {number} chapter
 * @property {string=} context
 * @property {number=} page
 * @property {number=} updatedAt
 *
 * @typedef {Object} Note
 * @property {string} id
 * @property {number} offset
 * @property {number} block
 * @property {number} char
 * @property {string} quote
 * @property {string} text
 * @property {number} createdAt
 * @property {number=} end
 * @property {'highlight'=} kind
 * @property {string=} color
 *
 * @typedef {Object} LibraryEntry
 * @property {string} id
 * @property {string} path
 * @property {string} title
 * @property {string=} author
 * @property {number} pageCount
 * @property {ReadingProgress|null=} progress
 * @property {string|null=} readingMode
 * @property {Record<string, unknown>=} reading
 * @property {number=} lastOpenedAt
 *
 * @typedef {Object} OcrStore
 * @property {number} version
 * @property {Record<number, {items:Array<unknown>,confidence?:number}>} pages
 *
 * @typedef {Object} LayoutStore
 * @property {number} version
 * @property {Record<number, Array<unknown>>} pages
 *
 * @typedef {Object} SearchResult
 * @property {ReadingLocator} locator
 * @property {number} end offset exclusivo en el texto normalizado
 * @property {string} context
 * @property {number} chapter
 * @property {number} page pagina original base cero
 * @property {number} percent
 *
 * @typedef {Object} NavigationReturnPoint
 * @property {ReadingLocator} locator
 * @property {'search'|'note'|'chapter'|string} origin
 * @property {number} createdAt
 *
 * @typedef {Object} TypographyPreset
 * @property {'compact'|'novel'|'relaxed'|'legible'|'custom'} id
 * @property {number} fontSize
 * @property {number} lineHeight
 * @property {number} columnWidth
 * @property {number} paragraphSpacing
 * @property {number} wordSpacing
 * @property {number} letterSpacing
 * @property {number} fontWeight
 * @property {number} verticalMargin
 * @property {string=} textAlign
 *
 * @typedef {Object} SpeechPreferences
 * @property {boolean} enabled
 * @property {number} rate
 * @property {string=} voice
 * @property {number|string=} sleepTimer
 *
 * @typedef {Object} DictionaryEntry
 * @property {string} lemma
 * @property {string} language
 * @property {string=} partOfSpeech
 * @property {string[]} definitions
 * @property {string[]=} forms
 * @property {string=} pronunciation
 *
 * @typedef {Object} VocabularyItem
 * @property {string} word
 * @property {string} lemma
 * @property {string} language
 * @property {number} lookedUpAt
 * @property {ReadingLocator=} locator
 *
 * @typedef {Object} ReadingComfortSettings
 * @property {'system'|'reduce'|'full'} motion
 * @property {number} uiScale
 * @property {boolean} showProgress
 * @property {boolean} showEta
 * @property {'off'|'guided'|'auto'} rhythmMode
 * @property {number} readingTargetWpm
 * @property {number} breakInterval
 * @property {boolean} collectReadingStats
 *
 * @typedef {Object} ReadingStudyMetrics
 * @property {'full'|'line'|'sentence'|'paged'} condition
 * @property {number} startedAt
 * @property {number} durationMs
 * @property {number} regressions
 * @property {number=} comprehension
 * @property {number=} fatigue
 * @property {number=} placeLoss
 * @property {number=} preference
 */

/**
 * Convierte progreso viejo o locator nuevo a la forma canonica. Los campos
 * adicionales se conservan para que Book v10 y v11 sigan siendo compatibles.
 * @param {Partial<ReadingLocator>|Partial<ReadingProgress>|number|null|undefined} value
 * @returns {ReadingLocator}
 */
export function toLocator (value) {
  if (typeof value === 'number') return { offset: finiteOffset(value) }
  const page = value?.page
  return {
    offset: finiteOffset(value?.offset),
    ...(typeof value?.context === 'string' && value.context ? { context: value.context } : {}),
    ...(typeof page === 'number' && Number.isInteger(page) && page >= 0 ? { page } : {})
  }
}

/** @param {unknown} value */
function finiteOffset (value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0
}
