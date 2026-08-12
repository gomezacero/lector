// Controlador de lectura: junta maquetado, medida de lineas, foco y progreso.
//
// Trabaja siempre sobre un capitulo, no sobre el libro entero: mantiene el DOM
// pequeno y la medida rapida. Cruzar el final de un capitulo carga el siguiente
// sin que el lector note la costura.

import { renderChapter } from './layout.js'
import { paintHighlights, clearHighlights } from './highlights.js'
import { buildLineIndex, offsetOfLine } from './lineIndex.js'
import { createFocusController } from './focus.js'
import { makeProgress, chapterAtOffset, lineForOffset, percentAt, startOffset, blockAtOffset } from './progress.js'
import { toSentenceUnits } from './sentences.js'
import { createFigureClips } from './figureClips.js'
import { createPageRenderer } from '../pdf/pageRender.js'
import { offsetFromLocator } from './readerContract.js'

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
  let presentation = 'continuous'
  let visualLines = []
  const listeners = new Set()

  const publish = event => {
    for (const listener of listeners) listener(event)
  }

  // Donde esta leyendo, en caracteres. Es el dato canonico: la linea es solo su
  // representacion con los ajustes de ahora. Solo cambia cuando el lector se
  // mueve, nunca al re-maquetar; si no, cada cambio de cuerpo lo arrastraria
  // hacia atras hasta el principio del parrafo.
  let anchor = 0

  function renderCurrentChapter () {
    const chapter = book.chapters[chapterIndex]
    if (!chapter) return
    renderChapter(book, chapter, layers)
    // Los rangos de resaltado mueren con el repintado: se vuelven a poner.
    paintHighlights(layers, book.blocks, chapter, notes?.all ?? [])
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
    visualLines = buildLineIndex(contentSharp)
    focus.setLines(unit === 'sentence' ? toSentenceUnits(visualLines, book.blocks) : visualLines)
    paintBookmarks()
  }

  /**
   * Un marcador pertenece a un rango de caracteres, no al parrafo entero.
   * Se pinta como un punto en el margen del renglon que actualmente contiene
   * ese caracter; al cambiar tipografia se vuelve a medir y permanece unido al
   * mismo texto.
   */
  function paintBookmarks () {
    for (const layer of [contentSharp, contentDim]) {
      layer.querySelectorAll('.reader-bookmark-marker').forEach(node => node.remove())
    }
    if (!book || !visualLines.length) return

    const chapter = book.chapters[chapterIndex]
    const bookmarks = (notes?.all ?? []).filter(note =>
      note.kind !== 'highlight' && note.block >= chapter.start && note.block < chapter.end)

    for (const note of bookmarks) {
      const index = lineForOffset(book, visualLines, note.offset)
      const line = visualLines[index]
      if (!line || line.block !== note.block) continue
      const top = (line.top + line.bottom) / 2
      for (const layer of [contentSharp, contentDim]) {
        const marker = document.createElement('span')
        marker.className = 'reader-bookmark-marker'
        marker.dataset.noteId = note.id
        marker.style.top = `${top}px`
        marker.setAttribute('aria-hidden', 'true')
        layer.appendChild(marker)
      }
    }
  }

  function currentOffset () {
    return offsetOfLine(focus.lines, book.blocks, focus.index)
  }

  function locator () {
    const excerpt = currentLine()
    const block = book?.blocks[blockAtOffset(book, anchor)]
    return {
      offset: anchor,
      ...(excerpt?.context ? { context: excerpt.context } : {}),
      ...(block?.page != null ? { page: block.page } : {})
    }
  }

  function emitStatus () {
    const excerpt = currentLine()
    const status = {
      chapter: book.chapters[chapterIndex]?.title ?? '',
      chapterIndex,
      percent: percentAt(book, anchor),
      offset: anchor,
      // La pagina del PDF original donde cae la lectura: para poder citarla
      // o cotejarla con una referencia, tambien en el texto re-maquetado.
      page: book.blocks.length
        ? (book.blocks[blockAtOffset(book, anchor)]?.page ?? 0) + 1
        : null,
      marked: Boolean(notes?.findBookmark?.(excerpt) ?? notes?.findBookmark?.(anchor))
    }
    onStatus?.(status)
    publish({ type: 'locator', locator: locator(), excerpt, status })
  }

  function scheduleSave () {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      if (book) onSave?.(makeProgress(book, anchor))
    }, SAVE_DELAY)
  }

  function flush () {
    clearTimeout(saveTimer)
    saveTimer = null
    if (!book || !focus.lineCount) return Promise.resolve()
    return Promise.resolve(onSave?.(makeProgress(book, anchor)))
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
      end: line.end,
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
      const saved = flush()
      clearHighlights()
      clipToken++
      clips?.close()
      clips = null
      book = null
      notes = null
      visualLines = []
      contentSharp.replaceChildren()
      contentDim.replaceChildren()
      return saved
    },

    move,
    page: direction => {
      if (presentation === 'paged') {
        focus.moveTo(focus.movePage(direction))
        afterMove()
      } else move(direction * focus.linesPerScreen())
    },
    jump: where => {
      if (where === 'start') goToOffset(0)
      else if (book) goToOffset(book.chars - 1)
    },
    chapter: direction => { if (book) crossChapter(direction) },
    goToOffset,
    currentLine,

    // Interfaz comun nueva. Los alias anteriores siguen durante la migracion
    // para que los consumidores existentes no tengan que cambiar de golpe.
    goToLocator: (locator, options) => goToOffset(offsetFromLocator(locator), options),
    getLocator: locator,
    getCurrentExcerpt: currentLine,
    subscribe (listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    setPresentation (next) {
      presentation = next === 'paged' ? 'paged' : 'continuous'
      focus.setPresentation(presentation)
      stage.dataset.presentation = presentation
      if (book) {
        measure()
        focus.moveTo(lineForOffset(book, focus.lines, anchor), { animate: false })
        emitStatus()
        publish({ type: 'layout', presentation, locator: locator() })
      }
    },
    getCapabilities: () => ({ textSelection: true, reflowPagination: true, speech: true }),
    setFocusSettings (settings) {
      focus.setSettings(settings)
      focus.refresh()
    },
    flush,

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
      publish({ type: 'layout', presentation, locator: locator() })
    },

    setFocusShape (settings) {
      focus.setSettings(settings)
      focus.refresh()
    },

    setSpeechActive (active) {
      if (!book) return
      unit = active ? 'sentence' : (document.body.dataset.mode === 'sentence' ? 'sentence' : 'line')
      measure()
      focus.moveTo(lineForOffset(book, focus.lines, anchor), { animate: false })
      emitStatus()
    },

    // Alias temporal para consumidores antiguos. Ya no existe estado visual
    // por bloque: cualquier cambio vuelve a pintar los marcadores por linea.
    markBlock: () => paintBookmarks(),
    refreshBookmarks: paintBookmarks,

    /** Tras crear o borrar un resaltado, sin repintar el capitulo entero. */
    refreshHighlights () {
      const chapter = book?.chapters[chapterIndex]
      if (chapter) paintHighlights(layers, book.blocks, chapter, notes?.all ?? [])
    },

    refreshStatus: emitStatus,
    get book () { return book },
    get isOpen () { return book !== null }
  }
}
