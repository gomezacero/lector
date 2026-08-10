// Controlador de lectura: junta maquetado, medida de lineas, foco y progreso.
//
// Trabaja siempre sobre un capitulo, no sobre el libro entero: mantiene el DOM
// pequeno y la medida rapida. Cruzar el final de un capitulo carga el siguiente
// sin que el lector note la costura.

import { renderChapter, setBlockMarked } from './layout.js'
import { buildLineIndex, offsetOfLine } from './lineIndex.js'
import { createFocusController } from './focus.js'
import { makeProgress, chapterAtOffset, lineForOffset, percentAt, startOffset, blockAtOffset } from './progress.js'
import { toSentenceUnits } from './sentences.js'
import { createFigureClips } from './figureClips.js'
import { createPageRenderer } from '../pdf/pageRender.js'

const SAVE_DELAY = 900

export function createReader ({ stage, sharpLayer, contentSharp, contentDim, onStatus, onSave }) {
  const focus = createFocusController({ stage, sharpLayer })
  const layers = { sharp: contentSharp, dim: contentDim }

  let book = null
  let notes = null
  let chapterIndex = 0
  let saveTimer = null
  let unit = 'line' // 'line' o 'sentence': por que avanza el foco
  let clips = null // recortes de figura; solo existe si el libro trae figuras
  let clipToken = 0 // invalida los recortes en vuelo al cambiar de capitulo

  // Donde esta leyendo, en caracteres. Es el dato canonico: la linea es solo su
  // representacion con los ajustes de ahora. Solo cambia cuando el lector se
  // mueve, nunca al re-maquetar; si no, cada cambio de cuerpo lo arrastraria
  // hacia atras hasta el principio del parrafo.
  let anchor = 0

  function renderCurrentChapter () {
    const chapter = book.chapters[chapterIndex]
    if (!chapter) return
    renderChapter(book, chapter, layers, notes?.markedBlocks ?? new Set())
    measure()
    // Los recortes llegan detras, sin bloquear: el hueco ya esta reservado
    // con su proporcion, asi que la medida de lineas no se mueve.
    void fillFigures(chapter)
  }

  /** Pone en las dos capas el recorte original de cada figura del capitulo. */
  async function fillFigures (chapter) {
    if (!clips) return
    const token = ++clipToken

    for (let i = chapter.start; i < chapter.end; i++) {
      if (book?.blocks[i]?.type !== 'figure') continue
      const clip = await clips.get(book, i).catch(() => null)
      // Cambiar de capitulo (o cerrar) deja obsoleto lo que estaba en vuelo.
      if (token !== clipToken || !book) return
      if (!clip) continue
      for (const layer of [contentSharp, contentDim]) {
        const img = layer.querySelector(`figure[data-block="${i}"] img`)
        if (img) img.src = clip.url
      }
    }
  }

  /**
   * Unidades por las que avanza el foco. Con frases, cada una abarca los
   * renglones que ocupa: el renglon es una unidad del maquetador y la frase lo
   * es del sentido, pero recortar a media linea cansaria la vista.
   */
  function measure () {
    const lines = buildLineIndex(contentSharp)
    focus.setLines(unit === 'sentence' ? toSentenceUnits(lines, book.blocks) : lines)
  }

  function currentOffset () {
    return offsetOfLine(focus.lines, book.blocks, focus.index)
  }

  function emitStatus () {
    onStatus?.({
      chapter: book.chapters[chapterIndex]?.title ?? '',
      chapterIndex,
      percent: percentAt(book, anchor),
      offset: anchor,
      // La pagina del PDF original donde cae la lectura: para poder citarla
      // o cotejarla con una referencia, tambien en el texto re-maquetado.
      page: book.blocks.length
        ? (book.blocks[blockAtOffset(book, anchor)]?.page ?? 0) + 1
        : null,
      marked: Boolean(notes?.find(anchor))
    })
  }

  function scheduleSave () {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      if (book) onSave?.(makeProgress(book, anchor))
    }, SAVE_DELAY)
  }

  /** Tras un movimiento deliberado, la linea nueva pasa a ser el ancla. */
  function afterMove () {
    anchor = currentOffset()
    emitStatus()
    scheduleSave()
  }

  /** Cambia de capitulo colocandose al principio o al final segun la direccion. */
  function crossChapter (direction) {
    const next = chapterIndex + direction
    if (next < 0 || next >= book.chapters.length) {
      focus.moveTo(direction < 0 ? 0 : focus.lineCount - 1)
      afterMove()
      return false
    }
    chapterIndex = next
    renderCurrentChapter()
    focus.moveTo(direction < 0 ? focus.lineCount - 1 : 0, { animate: false })
    afterMove()
    return true
  }

  function move (delta) {
    if (!book || !focus.lineCount) return
    const next = focus.index + delta

    if (next < 0) return void crossChapter(-1)
    if (next >= focus.lineCount) return void crossChapter(1)

    focus.moveTo(next)
    afterMove()
  }

  function goToOffset (offset, { animate = false } = {}) {
    if (!book) return
    const chapter = chapterAtOffset(book, offset)
    if (chapter !== chapterIndex) {
      chapterIndex = chapter
      renderCurrentChapter()
    }
    focus.moveTo(lineForOffset(book, focus.lines, offset), { animate })
    // Saltar a una nota deja el ancla en el punto pedido, no al principio de
    // la linea que lo muestra.
    anchor = offset
    emitStatus()
    scheduleSave()
  }

  /** Texto de la linea activa, con su parrafo como contexto para la cita. */
  function currentLine () {
    const line = focus.lines[focus.index]
    if (!line) return null
    const block = book.blocks[line.block]
    const context = block?.text.slice(line.start, line.start + 200).trim() ?? ''
    return {
      block: line.block,
      char: line.start,
      offset: (block?.start ?? 0) + line.start,
      text: block?.text.slice(line.start, line.end).trim() ?? '',
      // Una figura no tiene texto que citar: sin esto la nota sale como «».
      context: context || (block?.type === 'figure' ? `Figura de la página ${block.page + 1}` : '')
    }
  }

  return {
    /** @param {'line'|'sentence'} [readingUnit] por que avanza el foco */
    async open (nextBook, progress, notesStore, bytes, readingUnit = 'line') {
      book = nextBook
      notes = notesStore
      unit = readingUnit
      anchor = progress?.offset ?? startOffset(nextBook)
      chapterIndex = chapterAtOffset(book, anchor)

      // Solo un libro con figuras abre el PDF: la prosa corriente no lo
      // necesita y asi no paga ni el worker ni la memoria del renderer.
      if (bytes && (nextBook.stats?.figures ?? 0) > 0) {
        const renderer = createPageRenderer()
        await renderer.open(bytes)
        clips = createFigureClips(renderer)
      }

      renderCurrentChapter()
      focus.moveTo(lineForOffset(book, focus.lines, anchor), { animate: false })
      emitStatus()
    },

    close () {
      clearTimeout(saveTimer)
      if (book && focus.lineCount) onSave?.(makeProgress(book, anchor))
      clipToken++
      clips?.close()
      clips = null
      book = null
      notes = null
      contentSharp.replaceChildren()
      contentDim.replaceChildren()
    },

    move,
    page: direction => move(direction * focus.linesPerScreen()),
    jump: where => {
      if (where === 'start') goToOffset(0)
      else if (book) goToOffset(book.chars - 1)
    },
    chapter: direction => { if (book) crossChapter(direction) },
    goToOffset,
    currentLine,

    /**
     * Rehace el indice de lineas tras un cambio de ajustes o de tamano de
     * ventana. Recoloca desde el ancla, no desde la linea actual: asi la frase
     * sigue siendo la misma por muchas veces que se toquen los ajustes.
     */
    relayout () {
      if (!book || !focus.lineCount) return
      measure()
      focus.moveTo(lineForOffset(book, focus.lines, anchor), { animate: false })
      emitStatus()
    },

    setFocusShape (settings) {
      focus.setSettings(settings)
      focus.refresh()
    },

    markBlock: (blockIndex, marked) => setBlockMarked(layers, blockIndex, marked),
    refreshStatus: emitStatus,
    get book () { return book },
    get isOpen () { return book !== null }
  }
}
