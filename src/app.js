// Arranque y cableado. Aqui no vive ninguna regla propia: solo se conectan la
// biblioteca, el lector, los ajustes y las notas, y se decide que se ve.

import { CACHE_VERSION } from '/src/pdf/pipeline.js'
import { migrateBook, validateBook, reanchor, textOf } from '/src/pdf/migrate.js'
import { blockAtOffset, percentAt, chapterAtOffset } from '/src/reader/progress.js'
import { createReader } from '/src/reader/reader.js'
import { createRegionReader } from '/src/reader/regionReader.js'
import { attachNavigation } from '/src/reader/navigation.js'
import { createScrubber } from '/src/reader/scrubber.js'
import { createPace } from '/src/reader/pace.js'
import { createReadingRhythm } from '/src/reader/readingRhythm.js'
import { attachHighlighter } from '/src/reader/highlighter.js'
import { exportNotesMarkdown } from '/src/notes/exportNotes.js'
import { createSettings } from '/src/settings/settings.js'
import { createSettingsPanel } from '/src/settings/settingsPanel.js'
import { createLibraryView } from '/src/library/libraryView.js'
import { createNotesStore } from '/src/notes/notesStore.js'
import { createNotesView } from '/src/notes/notesView.js'
import { percent, h } from '/src/ui/dom.js'
import { confirmAction, readableSize } from '/src/ui/confirm.js'
import { resolveMode, MODES, isFlowMode } from '/src/reader/mode.js'
import { hasUnappliedOcr, unattemptedPages } from '/src/ocr/pending.js'
import { createBookSheet } from '/src/library/bookSheet.js'
import { makeCover } from '/src/pdf/pageRender.js'
import { createOcrRun } from '/src/ocr/ocrRun.js'
import { createLayoutRun, layoutAvailable } from '/src/layout/layoutRun.js'
import { createPdfIngestor } from '/src/document/pdfIngestor.js'
import { assertReaderController } from '/src/reader/readerContract.js'
import { createBackgroundTaskCoordinator } from '/src/app/backgroundTaskCoordinator.js'
import { createBookSessionController } from '/src/app/bookSessionController.js'
import { createAppShellController } from '/src/app/appShellController.js'
import { applyShortcutLabels } from '/src/platform/shortcuts.js'
import { createBookSearchTask } from '/src/search/bookSearch.js'
import { createSearchPanel } from '/src/search/searchPanel.js'
import { createCommandRegistry } from '/src/input/commands.js'
import { createDictionaryProvider } from '/src/dictionary/dictionaryProvider.js'
import { createDictionaryPopover } from '/src/dictionary/dictionaryPopover.js'
import { createSpeechController } from '/src/speech/speechController.js'
import { createOfflineSpeechPort } from '/src/speech/offlineSpeechPort.js'
import { createGamepadAdapter } from '/src/input/gamepad.js'
import { createWellbeingController } from '/src/wellbeing/wellbeingController.js'
import { createBreakPrompt } from '/src/wellbeing/breakPrompt.js'
import { createStudyRecorder } from '/src/study/studyRecorder.js'
import { createStudyPanel } from '/src/study/studyPanel.js'
import { featureEnabled } from '/src/app/featureFlags.js'

const $ = id => document.getElementById(id)
const el = {
  body: document.body,
  stage: $('stage'),
  sharpLayer: $('layer-sharp'),
  contentSharp: $('content-sharp'),
  contentDim: $('content-dim'),
  hud: $('hud'),
  hudChapter: $('hud-chapter'),
  hudOcr: $('hud-ocr'),
  hudPage: $('hud-page'),
  hudProgress: $('hud-progress'),
  hudEta: $('hud-eta'),
  hudRhythm: $('hud-rhythm'),
  hudBack: $('hud-back'),
  hudSpeech: $('hud-speech'),
  hudSpeechPrev: $('hud-speech-prev'),
  hudSpeechNext: $('hud-speech-next'),
  chapterMenu: $('chapter-menu'),
  hudMode: $('hud-mode'),
  hudBookmark: $('hud-bookmark'),
  loading: $('loading'),
  loadingText: $('loading-text'),
  toast: $('toast')
}

let settings = null
let readers = null // { flow, page }
let reader = null // el que esta en uso
let settingsPanel = null
let notesView = null
let searchView = null
let searchIndex = null
let dictionary = null
let speech = null
let speechPort = null
let gamepad = null
let wellbeing = null
let breakPrompt = null
let studyRecorder = null
let studyLastOffset = null
let scrubber = null
let pace = null
let savedCpm = 0
let rhythm = null
let rhythmAdvance = false
let notes = null
let entries = []
let bookSheet = null
let session = null
const backgroundTasks = createBackgroundTaskCoordinator()
const commands = createCommandRegistry()
const shellController = createAppShellController({
  body: el.body,
  hud: el.hud,
  chapterMenu: el.chapterMenu
})
const documentIngestor = createPdfIngestor({
  onWorkerFallback: err => window.lector.log.error(`ingesta sin worker: ${err.message}`)
})

// --- Avisos y carga --------------------------------------------------------

let toastTimer = null
function toast (message, ms = 2800) {
  el.toast.textContent = message
  el.toast.hidden = false
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { el.toast.hidden = true }, ms)
}

const showLoading = text => { el.loadingText.textContent = text; el.loading.hidden = false }
const hideLoading = () => { el.loading.hidden = true }

// --- Biblioteca ------------------------------------------------------------

async function refreshLibrary () {
  entries = await window.lector.library.list()
  library.render(entries)
}

const library = createLibraryView({
  grid: $('library-grid'),
  empty: $('library-empty'),
  onOpen: entry => openBook(entry.path, entry),
  onSheet: entry => openBook(entry.path, entry, { sheet: true }),
  onRemove: entry => removeBook(entry)
})

/**
 * Borrar destruye el texto ya procesado, las notas y el punto de lectura, y
 * solo el PDF se salva. Antes se hacia de un clic con un boton que decia
 * "quitar de la biblioteca", que suena a sacar de una lista.
 */
async function removeBook (entry) {
  const { bytes, notes: noteCount } = await window.lector.library.usage(entry.id)
  const read = entry.progress?.percent ?? 0

  const confirmed = await confirmAction({
    title: `¿Borrar «${entry.title}»?`,
    lines: [
      `Se borra el texto ya preparado (${readableSize(bytes)}); al volver a abrirlo hay que prepararlo otra vez.`,
      noteCount === 1 ? 'Se borra tu nota.' : noteCount ? `Se borran tus ${noteCount} notas.` : null,
      // Recien empezado el porcentaje redondea a cero, y "(0%)" no dice nada.
      read > 0 ? `Se pierde por dónde ibas${read >= 0.005 ? ` (${percent(read)})` : ''}.` : null,
      'El PDF no se toca: sigue donde está.'
    ].filter(Boolean),
    confirmLabel: 'Borrar el libro'
  })
  if (!confirmed) return

  const result = await window.lector.library.remove(entry.id)
  entries = result.entries
  library.render(entries)

  if (result.ok) toast(`Borrado «${entry.title}»: ${readableSize(result.bytes)} liberados`)
  else toast(`No se pudo borrar «${entry.title}»: ${result.error}`, 6000)
}

// --- Apertura de libros ----------------------------------------------------

async function pickAndOpen () {
  const picked = await window.lector.pdf.pick()
  if (picked) await openLoaded(picked)
}

async function openBook (filePath, entry, options) {
  showLoading('Abriendo el libro…')
  const loaded = await window.lector.pdf.load(filePath)

  if (loaded?.error) {
    hideLoading()
    if (loaded.error === 'missing' && entry) {
      entries = await window.lector.library.upsert({ ...entry, missing: true })
      library.render(entries)
      await offerRelink(entry, options)
      return
    }
    toast(loaded.error === 'missing'
      ? 'El archivo ya no está donde estaba. ¿Lo has movido?'
      : `No se pudo abrir: ${loaded.error}`, 5000)
    return
  }
  await openLoaded(loaded, entry, options)
}

/**
 * Un libro cuyo archivo desaparecio no esta perdido: si el lector señala el
 * PDF en su nueva ubicacion, la entrada se reengancha y el progreso y las
 * notas siguen donde estaban. El id es el hash del contenido, asi que un PDF
 * distinto no puede colarse en el sitio de otro.
 */
async function offerRelink (entry, options) {
  const confirmed = await confirmAction({
    title: 'El archivo ya no está donde estaba',
    lines: [
      '¿Lo has movido o renombrado? Puedes señalar su nueva ubicación.',
      'El progreso, los marcadores y las notas se conservan.'
    ],
    confirmLabel: 'Localizar el archivo',
    danger: false
  })
  if (!confirmed) return

  const picked = await window.lector.pdf.pick()
  if (!picked) return
  if (picked.id !== entry.id) {
    toast('Ese PDF no es el mismo libro: su contenido no coincide.', 6000)
    return
  }

  const relinked = { ...entry, path: picked.path, missing: false }
  entries = await window.lector.library.upsert(relinked)
  library.render(entries)
  toast('Archivo localizado: todo sigue donde estaba.', 4000)
  await openLoaded(picked, relinked, options)
}

/**
 * Del PDF ya leido en memoria al lector, pasando por la cache si la hay.
 * @param {Object} [options]
 * @param {boolean} [options.sheet] forzar la ficha aunque el libro ya se conozca
 */
async function openLoaded (loaded, entry, { sheet = false } = {}) {
  try {
    showLoading('Abriendo el libro…')
    const { book, previous } = await loadOrBuild(loaded)

    // Abrir por el dialogo un libro que ya esta en la biblioteca no trae su
    // ficha: sin recuperarla aqui, el progreso y el modo se sobrescribirian y
    // se perderia por donde iba la lectura.
    const known = entry ?? entries.find(e => e.id === loaded.id)

    // Antes de que el progreso viejo toque el libro nuevo.
    if (previous) await reanchorStored(loaded.id, previous, book, known)

    // Sin texto y sin paginas escaneadas no hay nada que ensenar: ni bloques
    // que re-maquetar ni imagen que hojear. Un escaneado si sigue adelante,
    // en modo pagina.
    if (!readable(book)) {
      shellController.showView('library')
      toast('Este PDF no contiene ni texto ni páginas que mostrar. No se puede leer con esta aplicación.', 7000)
      return
    }

    if (book.stats?.suspectPages > 0 && !known) {
      // Solo la primera vez: el aviso repetido en cada apertura cansa mas de
      // lo que ayuda, y el libro no va a cambiar.
      toast(`Ojo: ${book.stats.suspectPages === 1 ? 'una página trae' : `${book.stats.suspectPages} páginas traen`} texto dudoso; si algo se lee raro, prueba la vista de página.`, 6000)
    }

    const nextEntry = {
      id: loaded.id,
      path: loaded.path,
      title: book.title,
      author: book.author,
      pageCount: book.pageCount,
      // La estanteria lo dice en la tarjeta: un escaneado se hojea, pero aun
      // no se puede leer linea a linea.
      scanned: isScanned(book),
      addedAt: known?.addedAt ?? Date.now(),
      lastOpenedAt: Date.now(),
      progress: known?.progress ?? null,
      readingMode: known?.readingMode ?? null,
      reading: known?.reading ?? {},
      missing: false
    }
    entries = await window.lector.library.upsert(nextEntry)

    const nextNotes = createNotesStore(loaded.id)
    await nextNotes.load()
    const nextDocument = {
      book,
      path: loaded.path,
      bytes: loaded.bytes,
      // Cajas del modelo de layout ya analizadas, si las hay: la vista de
      // pagina las prefiere a las heuristicas en esas paginas.
      layouts: await window.lector.layout.read(loaded.id)
    }

    // Ctrl+O tambien funciona mientras se lee. Antes de sustituir las
    // referencias de la sesion, vaciamos todo lo que pertenece al libro
    // anterior; asi una nota o un progreso tardio no viajan al siguiente.
    if (session.entry) {
      backgroundTasks.endSession()
      speech?.stop()
      if (reader?.isOpen) await reader.close()
      await Promise.all([session.flush(), notes?.flush?.(), settings.flush()])
      await window.lector.app.flush()
    }
    notes = nextNotes
    session.open(nextEntry, nextDocument)
    backgroundTasks.beginSession(loaded.id)


    // La ficha solo aparece la primera vez: reabrir un libro conocido lleva
    // directo al punto de lectura, que es lo que se quiere casi siempre.
    if (sheet || !session.entry.readingMode) {
      hideLoading()
      shellController.showView('sheet')
      bookSheet.render(book, {
        entry: session.entry,
        title: session.entry.progress ? 'Seguir leyendo' : 'Empezar a leer'
      })
      return
    }

    await enterReader()
  } catch (err) {
    console.error(err?.stack ?? err)
    toast(`No se pudo procesar el PDF: ${err.message}`, 6000)
    shellController.showView('library')
  } finally {
    hideLoading()
  }
}

/**
 * Dibuja la portada del libro que se acaba de cerrar.
 *
 * Se hace al salir y no al entrar porque solo hace falta en la estanteria, y
 * porque dibujarla mientras se abre el libro compite con las paginas del propio
 * lector: la vista de pagina llegaba a quedarse sin dibujar.
 *
 * Los bytes van en una copia propia: pdf.js los transfiere al worker y los deja
 * inservibles para quien venga detras.
 */
async function drawCoverOf (book) {
  if (!book?.bytes || !session?.entry) return
  try {
    await makeCover(new Uint8Array(book.bytes), session.entry.id)
  } catch (err) {
    console.warn('no se pudo dibujar la portada:', err.message)
  }
}

/**
 * Devuelve el libro listo para leer y, cuando hubo que reprocesarlo, tambien
 * el cache anterior: es la unica ocasion de re-anclar el progreso y las notas
 * contra el texto viejo antes de que desaparezca.
 * @returns {Promise<{book: Object, previous: Object|null}>}
 */
async function loadOrBuild (loaded) {
  const cached = await window.lector.book.readCache(loaded.id)
  // El OCR guardado sobrevive a todo reproceso: si trae texto que el cache
  // aun no incorpora, este se reconstruye aunque la version este al dia (pasa
  // al reabrir un libro cuyo OCR termino con la aplicacion cerrada o a punto
  // de cerrarse). Solo el texto de verdad cuenta: las paginas intentadas que
  // quedaron vacias siguen siendo 'scanned' siempre, y tratarlas como
  // pendientes reprocesaria el libro entero en cada apertura.
  const ocr = await window.lector.ocr.read(loaded.id)
  const ocrPending = hasUnappliedOcr(cached?.pageKinds, ocr?.pages)

  // Un cache al dia pero roto —un fichero a medio escribir, una edicion a
  // mano— se reprocesa en vez de dejar el lector con datos sin sentido.
  if (cached?.version === CACHE_VERSION && !validateBook(cached).length && !ocrPending) {
    return { book: cached, previous: null }
  }

  // Un cache de una version anterior puede transformarse en sitio cuando el
  // cambio no movio ni el texto ni los offsets; si no, cae al reproceso.
  if (!ocrPending && typeof cached?.version === 'number' && cached.version < CACHE_VERSION) {
    const migrated = migrateBook(cached, CACHE_VERSION)
    if (migrated.book && !validateBook(migrated.book).length) {
      await window.lector.book.writeCache(loaded.id, migrated.book)
      return { book: migrated.book, previous: null }
    }
  }

  const book = await ingest(loaded.bytes, {
    fileName: loaded.fileName,
    ocrItemsByPage: ocr?.pages,
    onProgress: (done, total) => showLoading(`Preparando el libro… página ${done} de ${total}`)
  })
  // Un PDF ilegible no llega a entrar en la biblioteca, asi que guardar su
  // cache dejaria un fichero que ninguna entrada nombra y que el borrado nunca
  // podria alcanzar. Un escaneado sin texto si entra, y si se guarda.
  if (readable(book)) await window.lector.book.writeCache(loaded.id, book)
  return { book, previous: cached ?? null }
}

/**
 * La ingesta corre en un worker y la ventana queda libre (se puede seguir en
 * la biblioteca mientras). Si el worker no arranca, cae al hilo principal:
 * mas lento de sentir, pero el libro se abre igual. Un fallo del pipeline
 * (PDF corrupto) no se reintenta: seria el mismo error otra vez.
 */
async function ingest (bytes, options) {
  return documentIngestor.ingest(bytes, options)
}

// Se puede leer si trae texto o, al menos, paginas que ensenar tal cual.
// Las 'ocr' sin bloque tambien se ensenan: son la imagen escaneada de siempre,
// solo que con un reconocimiento que no dio texto util.
const readable = book => book.blocks.length > 0 ||
  (book.pageKinds ?? []).some(k => k === 'scanned' || k === 'mixed' || k === 'ocr')

const isScanned = book =>
  (book.stats?.scannedPages ?? 0) / Math.max(1, book.pageCount) > 0.5

/**
 * Tras un reproceso los offsets pueden haberse movido: el punto de lectura y
 * las notas se buscan de nuevo por su texto —y por su pagina como repuesto—
 * antes de que nada los use. El porcentaje y el capitulo se recalculan; la
 * fecha no, porque re-anclar no es leer.
 */
async function reanchorStored (id, oldBook, book, known) {
  // El texto completo del libro nuevo, una sola vez: son varios MB en un
  // libro grande y cada re-anclaje lo necesita.
  const text = textOf(book)

  if (known?.progress) {
    const offset = reanchor(oldBook, book, known.progress, text)
    known.progress = {
      ...known.progress,
      offset,
      percent: percentAt(book, offset),
      chapter: chapterAtOffset(book, offset)
    }
  }

  const stored = (await window.lector.notes.read(id)) ?? []
  if (stored.length) {
    for (const note of stored) {
      // Un resaltado conserva su largo: el final viaja con el principio.
      const span = note.end != null ? Math.max(0, note.end - note.offset) : null
      // La cita que la nota ya guardaba para su lista es tambien su ancla.
      note.offset = reanchor(oldBook, book, { offset: note.offset, context: note.quote }, text)
      note.block = blockAtOffset(book, note.offset)
      note.char = Math.max(0, note.offset - (book.blocks[note.block]?.start ?? 0))
      if (span != null) note.end = Math.min(note.offset + span, book.chars)
    }
    await window.lector.notes.replace(id, stored)
  }
}

// --- OCR de escaneados -----------------------------------------------------

function setOcrChip (text) {
  el.hudOcr.textContent = text ?? ''
  el.hudOcr.hidden = !text
}

/**
 * Ofrece reconocer el texto de las paginas escaneadas (o con texto danado)
 * del libro abierto.
 *
 * Pregunta solo la primera vez: son minutos de CPU y es una decision del
 * lector. El "no" se recuerda con el libro, y siempre queda el boton de los
 * ajustes para cambiar de idea (forced). Una pasada ya empezada se reanuda
 * sin preguntar, y al terminar el libro se reconstruye sin perder el punto.
 */
async function maybeStartOcr ({ forced = false } = {}) {
  const book = session?.document?.book
  const entry = session?.entry
  if (!book || backgroundTasks.has('ocr') || !entry) return
  if (!((book.stats?.scannedPages ?? 0) + (book.stats?.suspectPages ?? 0) > 0)) return

  const stored = await window.lector.ocr.read(entry.id)
  // Sin paginas por intentar no hay nada que reconocer: lo ya reconocido lo
  // aplico loadOrBuild al abrir. Arrancar un run vacio acababa en un onDone
  // inmediato que reconstruia el libro (con su aviso) en cada apertura.
  if (!unattemptedPages(book.pageKinds, stored?.pages).length) return
  const resumed = Object.keys(stored?.pages ?? {}).length > 0

  if (forced) {
    if (entry.ocrDeclined) {
      session.patchEntry({ ocrDeclined: false })
      entries = await window.lector.library.upsert({ id: entry.id, ocrDeclined: false })
    }
  } else {
    if (entry.ocrDeclined) return
    if (!resumed) {
      const confirmed = await confirmAction({
        title: '¿Reconocer el texto de este libro?',
        lines: [
          'Tiene páginas escaneadas o con texto dañado: se pueden reconocer aquí mismo, sin salir de tu equipo.',
          'Tarda unos minutos y puedes seguir hojeando mientras tanto.',
          'Si cambias de idea más tarde, el botón está en Ajustes.'
        ],
        confirmLabel: 'Reconocer el texto'
      })
      if (!confirmed) {
        session.patchEntry({ ocrDeclined: true })
        entries = await window.lector.library.upsert({ id: entry.id, ocrDeclined: true })
        return
      }
    }
  }

  const id = entry.id
  const token = backgroundTasks.token()
  const ocrRun = createOcrRun({
    id,
    book,
    bytes: session.document.bytes,
    onProgress: (done, total) => setOcrChip(`Reconociendo texto… ${done}/${total}`),
    onDone: backgroundTasks.guard(token, () => finishOcr(id)),
    onError: backgroundTasks.guard(token, err => {
      console.error(err)
      setOcrChip(null)
      toast(`El reconocimiento falló: ${err.message}`, 6000)
    })
  })
  setOcrChip('Reconociendo texto…')
  wakeHud()
  void backgroundTasks.start('ocr', ocrRun, token)
}

/** Con todo reconocido, el libro se reconstruye ya con su texto. */
async function finishOcr (id) {
  setOcrChip(null)
  // Si el libro ya no esta abierto, no se pierde nada: loadOrBuild aplica el
  // OCR guardado en la proxima apertura.
  if (!session?.document || session.entry?.id !== id) return

  showLoading('Aplicando el texto reconocido…')
  try {
    const previous = session.document.book
    const ocr = await window.lector.ocr.read(id)
    const book = await ingest(session.document.bytes, { ocrItemsByPage: ocr?.pages })
    await window.lector.book.writeCache(id, book)
    // El progreso provisional (pagina a pagina) cae en el primer bloque de la
    // misma pagina del texto nuevo; las notas, por su cita o su pagina.
    await reanchorStored(id, previous, book, session.entry)
    await notes.load()

    session.setDocument({ ...session.document, book })
    session.patchEntry({ title: book.title, scanned: isScanned(book) })
    entries = await window.lector.library.upsert({
      id,
      title: session.entry.title,
      scanned: session.entry.scanned,
      progress: session.entry.progress
    })

    if (el.body.dataset.view === 'reader') {
      await applyMode(resolveMode(book, session.entry.readingMode), book,
        session.entry.progress, session.document.bytes)
      notesView.render(notes.all, book)
    }
    toast('Texto reconocido: ya puedes leer este libro línea a línea.', 6000)
  } catch (err) {
    console.error(err)
    toast(`No se pudo aplicar el texto reconocido: ${err.message}`, 6000)
  } finally {
    hideLoading()
  }
}

/**
 * Analiza en segundo plano las paginas complejas del libro abierto —hoy, sus
 * portadillas— con el modelo de layout, si esta instalado. Sin dialogo: son
 * segundos, no minutos, y el resultado solo mejora las paradas.
 */
async function maybeStartLayout () {
  const book = session?.document?.book
  if (!book || backgroundTasks.has('layout') || backgroundTasks.has('ocr') || !session.entry) return

  const pages = (book.pageRoles ?? [])
    .map((role, page) => role === 'opener' ? page : -1)
    .filter(page => page >= 0)
    .filter(page => !session.document.layouts?.pages?.[page])
  if (!pages.length) return
  if (!await layoutAvailable()) return

  const id = session.entry.id
  const token = backgroundTasks.token()
  const layoutRun = createLayoutRun({
    id,
    bytes: session.document.bytes,
    pages,
    onProgress: (done, total) => setOcrChip(`Analizando páginas… ${done}/${total}`),
    onDone: backgroundTasks.guard(token, stored => finishLayout(id, stored)),
    onError: backgroundTasks.guard(token, err => {
      // El modelo es un extra: si falla, las heuristicas siguen mandando.
      console.warn('layout:', err.message)
      setOcrChip(null)
    })
  })
  void backgroundTasks.start('layout', layoutRun, token)
}

/** Con las cajas listas, la vista de pagina reconstruye sus paradas. */
async function finishLayout (id, stored) {
  setOcrChip(null)
  if (!session?.document || session.entry?.id !== id) return

  session.setDocument({ ...session.document, layouts: stored })
  // Solo la vista de pagina usa las cajas; el flujo no se toca. Se recoloca
  // en el mismo offset: las paradas cambian, el punto de lectura no.
  if (el.body.dataset.view === 'reader' && el.body.dataset.mode === 'page') {
    reader.setLayouts?.(stored)
    await reader.open(session.document.book, { offset: session.offset }, notes, session.document.bytes)
    reader.refreshStatus()
  }
}

async function backToLibrary () {
  // Lo reconocido hasta ahora queda guardado y se reanuda al reabrir.
  backgroundTasks.endSession()
  speech?.stop()
  rhythm?.stop()
  wellbeing?.stop()
  setOcrChip(null)
  if (reader?.isOpen) {
    await reader.close()
  }
  // El cierre guarda el punto de lectura; sin esperarlo, la estanteria se
  // repinta con los datos de antes y el progreso parece no haberse movido.
  await Promise.all([session.flush(), notes?.flush?.(), settings.flush()])
  await window.lector.app.flush()
  // Con el lector ya cerrado, el hilo esta libre para dibujar la portada.
  await drawCoverOf(session.document)
  // Fuera de un libro mandan los ajustes globales otra vez.
  settings.useBook({})
  showPanel(null, { persist: false })
  closeChapterMenu()
  scrubber?.setBook(null)
  searchIndex?.cancel()
  searchIndex = null
  dictionary?.close()
  // Un aviso de la lectura no tiene sentido ya en la estanteria.
  el.toast.hidden = true
  clearTimeout(toastTimer)
  session.clear()
  notes = null
  shellController.showView('library')
  await refreshLibrary()
}

/** De la ficha al lector, con los ajustes que ese libro tenga guardados. */
async function enterReader () {
  const { book, bytes } = session.document
  settings.useBook(session.entry.reading)
  pace?.reset()
  rhythm?.stop()
  rhythm?.configure({
    mode: settings.get('rhythmMode') ?? 'guided',
    targetWpm: settings.get('readingTargetWpm') ?? 180
  })

  try {
    shellController.showView('reader')
    // El maquetado necesita que la vista ya este visible para medir bien.
    await nextFrame()
    await applyMode(resolveMode(book, session.entry.readingMode), book, session.entry.progress, bytes)
    searchIndex?.cancel()
    searchIndex = null
    const searchToken = backgroundTasks.token()
    const searchTask = createBookSearchTask(book, backgroundTasks.guard(searchToken, index => {
      searchIndex = index
    }))
    void backgroundTasks.start('search-index', searchTask, searchToken)
    notesView.render(notes.all, book)
    const initialStats = settings.get('collectReadingStats')
      ? await window.lector.stats.read(session.entry.id)
      : null
    wellbeing?.start({
      interval: settings.get('breakInterval'),
      collect: settings.get('collectReadingStats'),
      initialStats
    })
    const savedPanel = settings.get('lastPanel')
    if (['settings', 'notes', 'search'].includes(savedPanel)) showPanel(savedPanel, { persist: false })
    wakeHud()
    // Con el lector ya en pantalla: el reconocimiento y el analisis de
    // layout son de fondo.
    void maybeStartOcr()
    void maybeStartLayout()
  } catch (err) {
    // Sin esto, un fallo al abrir deja la pantalla en blanco sin decir nada.
    console.error(err)
    toast(`No se pudo abrir el libro: ${err.message}`, 6000)
    shellController.showView('library')
  }
}

// --- Modos de lectura ------------------------------------------------------

async function applyMode (mode, book, progress, bytes) {
  if (speech?.isActive) speech.stop()
  if (reader?.isOpen) {
    await reader.close()
  }

  // Linea y frase comparten lector: solo cambia por que avanza el foco.
  reader = isFlowMode(mode) ? readers.flow : readers.page
  el.body.dataset.mode = mode
  el.hudMode.textContent = MODES[mode].label
  el.hudMode.title = `${MODES[mode].hint}. Pulsa o usa V para cambiar de vista.`

  reader.setFocusSettings(settings.all)
  const presentation = isFlowMode(mode) ? (settings.get('presentationMode') ?? 'continuous') : 'continuous'
  el.body.dataset.presentation = presentation
  reader.setPresentation(presentation)
  reader.setLayouts?.(session?.document?.layouts ?? null)
  await reader.open(book, progress, notes, bytes, mode === 'sentence' ? 'sentence' : 'line')
  // La primera muestra tras abrir o cambiar de vista no debe cruzar saltos.
  pace?.reset()
  scrubber?.setBook(book)
  settingsPanel?.refresh()
}

/** Cambia de vista sin perder el punto de lectura. */
async function switchMode (next) {
  if (!reader?.isOpen || !session?.document || next === el.body.dataset.mode) return

  showLoading('Cambiando de vista…')
  try {
    // La vista de pagina necesita el PDF para dibujarlo, no solo su texto.
    // Los bytes siguen en memoria desde la apertura (openDocument trabaja
    // sobre una copia): releer el archivo y recalcular su hash por cada
    // pulsacion de V eran cientos de ms de disco para nada.
    await applyMode(next, session.document.book, reader.getLocator(), session.document.bytes)
  } finally {
    hideLoading()
  }
}

async function toggleMode () {
  // Un escaneado sin OCR no tiene texto que re-maquetar: V no lleva a ninguna
  // parte y conviene decir por que en vez de no hacer nada.
  if (session?.document?.book?.provisional) {
    toast('Este libro es un escaneado sin texto reconocido: solo se puede hojear la página original.', 5000)
    return
  }
  const next = el.body.dataset.mode === 'page' ? 'flow' : 'page' // V alterna entre re-maquetado y pagina
  // El modo es del libro, no de la aplicacion: cambiarlo aqui no toca los demas.
  settings.update({ readingMode: next })
  await switchMode(next)
}

/**
 * Guarda en la biblioteca los ajustes de lectura del libro abierto.
 *
 * En memoria se actualiza al instante; al disco se baja una sola vez al soltar
 * el deslizador (cada llamada es un leer-y-reescribir de library.json entero
 * por IPC, y arrastrando llegan decenas por segundo). El plazo es el mismo que
 * el de los ajustes globales en settings.js.
 */
function saveBookSettings (reading) {
  session?.scheduleReading(reading)
}

// --- HUD -------------------------------------------------------------------

function wakeHud () {
  shellController.wakeHud()
}

// --- Paneles ---------------------------------------------------------------

/**
 * Abre un panel y cierra el otro. Con un panel abierto la columna de texto se
 * aparta para no quedar debajo, asi que el estado tiene que estar centralizado.
 * @param {'settings'|'notes'|'search'|null} which null los cierra todos
 */
function showPanel (which, { persist = true } = {}) {
  const active = shellController.showPanel(which)
  for (const [name, id] of [['settings', 'hud-settings'], ['notes', 'hud-notes'], ['search', 'hud-search']]) {
    const button = $(id)
    const selected = active === name
    button?.classList.toggle('is-on', selected)
    button?.setAttribute('aria-pressed', String(selected))
  }
  // Persistir el estado efectivo, no la opcion solicitada: al pulsar de nuevo
  // el mismo boton el panel se cierra y no debe reaparecer al abrir el libro.
  if (persist && session?.entry) settings.update({ lastPanel: active ?? '' })
  syncRhythmSuspension()
  return active
}

const panelIsOpen = which => shellController.panelIsOpen(which)

function onStatus (status) {
  el.hudChapter.textContent = status.chapter
  el.hudChapter.disabled = (session?.document?.book?.chapters?.length ?? 0) < 2
  el.hudPage.textContent = status.page ? `p. ${status.page}` : ''
  el.hudPage.hidden = !status.page
  el.hudProgress.textContent = percent(status.percent)
  el.hudProgress.hidden = settings?.get('showProgress') === false
  el.hudBack.hidden = !session?.canReturn
  searchView?.refresh()
  updateEta(status)
  updateRhythm(status)
  if (settings?.get('showEta') === false) el.hudEta.hidden = true
  el.hudBookmark.classList.toggle('is-on', status.marked)
  el.hudBookmark.setAttribute('aria-pressed', String(Boolean(status.marked)))
  el.hudBookmark.textContent = status.marked ? 'Quitar marca' : 'Marcar'
  el.hudBookmark.title = status.marked
    ? 'Quitar la marca de esta línea (M)'
    : 'Marcar esta línea (M)'
  session?.setOffset(status.offset)
  scrubber?.setOffset(status.offset)
  // El punto de lectura exacto, para poder comprobarlo desde fuera.
  el.body.dataset.offset = String(status.offset)
  wellbeing?.activity()
  wellbeing?.boundary()
  if (studyRecorder?.active && studyLastOffset != null && status.offset < studyLastOffset) studyRecorder.regression()
  studyLastOffset = status.offset
}

/**
 * "~8 min": lo que queda de capitulo al ritmo real de este lector. La cifra
 * solo se ensena cuando hay muestras suficientes, y la velocidad aprendida se
 * guarda con los ajustes para no empezar de cero en la proxima sesion.
 */
function updateEta (status) {
  const book = session?.document?.book
  el.hudEta.hidden = true
  if (!book || book.provisional || status.chapterIndex == null) return

  if (!rhythmAdvance) pace?.record(status.offset, Date.now())

  const chapter = book.chapters[status.chapterIndex]
  const end = chapter ? (book.blocks[chapter.end]?.start ?? book.chars) : book.chars
  const minutes = pace?.minutesFor(Math.max(0, end - status.offset))
  if (minutes == null) return

  el.hudEta.textContent = minutes < 1 ? '<1 min' : `~${Math.round(minutes)} min`
  el.hudEta.hidden = false

  // Persistir solo cuando la velocidad se ha movido de verdad: cada status
  // seria una escritura por linea leida.
  const cpm = Math.round(pace.cpm)
  if (pace.ready && Math.abs(cpm - savedCpm) > savedCpm * 0.1) {
    savedCpm = cpm
    settings.update({ paceCpm: cpm })
  }
}

function updateRhythm (status) {
  const excerpt = reader?.getCurrentExcerpt?.()
  const book = session?.document?.book
  if (!excerpt?.text || !book) return rhythm?.stop()
  const block = book.blocks[excerpt.block]
  rhythm?.enter({
    key: `${status.offset}:${excerpt.block}:${excerpt.char}`,
    text: excerpt.text,
    heading: block?.type === 'heading'
  })
}

function syncRhythmSuspension () {
  if (!rhythm) return
  const panelOpen = Boolean(settingsPanel?.isOpen || notesView?.isOpen || searchView?.isOpen)
  rhythm.setSuspended(panelOpen || document.hidden || !document.hasFocus() || Boolean(speech?.isActive))
}

// --- Indice de capitulos -----------------------------------------------------

/** Despliega la lista de capitulos sobre el HUD; el actual, senalado. */
function toggleChapterMenu () {
  if (!el.chapterMenu.hidden) return closeChapterMenu()

  const book = session?.document?.book
  if (!book || book.chapters.length < 2) return

  const current = chapterAtOffset(book, session.offset)
  const items = []
  let lastPart = null
  book.chapters.forEach((chapter, i) => {
    if (chapter.part && chapter.part !== lastPart) {
      items.push(h('div', { class: 'chapter-part', role: 'presentation', text: chapter.part }))
      lastPart = chapter.part
    }
    items.push(h('button', {
      class: [i === current ? 'is-on' : '', chapter.kind ? 'is-auxiliary' : '']
        .filter(Boolean)
        .join(' '),
      dataset: { kind: chapter.kind ?? 'chapter' },
      role: 'menuitem',
      text: chapter.title,
      onclick: () => {
        closeChapterMenu()
        navigateExplicit({ offset: book.blocks[chapter.start]?.start ?? 0 }, 'chapter')
        wakeHud()
      }
    }))
  })
  el.chapterMenu.replaceChildren(...items)
  el.chapterMenu.hidden = false
  el.hudChapter.setAttribute('aria-expanded', 'true')
  el.chapterMenu.querySelector('.is-on')?.scrollIntoView({ block: 'center' })
  wakeHud()
}

function navigateExplicit (locator, origin) {
  if (!reader?.isOpen) return
  session.rememberReturnPoint(reader.getLocator(), origin)
  reader.goToLocator(locator)
  el.hudBack.hidden = !session.canReturn
  searchView?.refresh()
}

function returnToPreviousLocator () {
  const locator = session?.takeReturnPoint()
  if (!locator || !reader?.isOpen) return
  reader.goToLocator(locator)
  el.hudBack.hidden = !session.canReturn
  searchView?.refresh()
  wakeHud()
}

function closeChapterMenu () {
  el.chapterMenu.hidden = true
  el.hudChapter.setAttribute('aria-expanded', 'false')
}

// --- Marcadores ------------------------------------------------------------

function toggleBookmark () {
  const line = reader.getCurrentExcerpt()
  if (!line || !notes) return

  // El HUD dice "marcado" mirando el ancla exacta (tras saltar a una nota
  // puede caer a mitad de linea), mientras la linea empieza en otro offset:
  // se miran los dos, o M crearia un duplicado de un marcador que ya se
  // ensena como puesto.
  const existing = notes.findBookmark(line) ?? notes.findBookmark(session.offset)
  if (existing) {
    notes.remove(existing.id)
    reader.refreshBookmarks?.()
    toast('Marcador quitado')
  } else {
    notes.add({ offset: line.offset, block: line.block, char: line.char, quote: line.context })
    reader.refreshBookmarks?.()
    toast('Línea marcada')
  }

  reader.refreshStatus()
  notesView.render(notes.all, reader.book)
}

/** Citas y notas a un .md que elige el lector. */
async function exportNotes () {
  const book = reader?.book
  if (!book || !notes?.all.length) {
    toast('Aún no hay nada que exportar en este libro.')
    return
  }
  const markdown = exportNotesMarkdown(book, notes.all)
  if (!markdown) return

  const name = `${(session?.entry?.title ?? 'notas').replace(/[\\/:*?"<>|]/g, '')} — notas.md`
  const saved = await window.lector.notes.export(name, markdown)
  if (saved) toast(`Notas guardadas en ${saved}`, 6000)
}

// --- Arranque --------------------------------------------------------------

const nextFrame = () => new Promise(resolve => requestAnimationFrame(() => resolve()))

async function start () {
  session = createBookSessionController({ library: window.lector.library })
  $('hud-search').hidden = !featureEnabled('search')
  $('hud-dictionary').hidden = !featureEnabled('dictionary')
  el.hudSpeech.hidden = !featureEnabled('speech')
  applyShortcutLabels()
  // Arrastrar un deslizador de cuerpo o ancho dispara decenas de cambios por
  // segundo. El CSS ya se aplico (settings.apply), asi que la pantalla responde
  // al momento; lo que se agrupa es la re-medida de lineas, que es lo caro.
  // Mismo plazo que el ResizeObserver de abajo.
  let relayoutTimer = null
  settings = createSettings(await window.lector.settings.read(), {
    onLayoutChange: () => {
      clearTimeout(relayoutTimer)
      relayoutTimer = setTimeout(() => reader?.relayout(), 120)
    },
    onChange: next => {
      reader?.setFocusSettings(next)
      rhythm?.configure({ mode: next.rhythmMode, targetWpm: next.readingTargetWpm })
      gamepad?.setEnabled(next.gamepadEnabled)
      gamepad?.setMapping({
        next: next.gamepadNextButton, previous: next.gamepadPreviousButton,
        pageNext: next.gamepadPageNextButton, pagePrevious: next.gamepadPagePreviousButton
      })
      if (el.hudProgress) el.hudProgress.hidden = next.showProgress === false
      if (next.showEta === false && el.hudEta) el.hudEta.hidden = true
      wellbeing?.configure({ interval: next.breakInterval, collect: next.collectReadingStats })
    },
    onBookChange: saveBookSettings
  })

  // El ritmo aprendido en otras sesiones es el punto de partida.
  savedCpm = settings.get('paceCpm') ?? 0
  pace = createPace(savedCpm)
  rhythm = createReadingRhythm({
    onProgress: state => {
      el.hudRhythm.hidden = !state.visible
      if (!state.visible) return
      el.hudRhythm.style.setProperty('--rhythm-progress', `${Math.round(state.progress * 100)}%`)
      el.hudRhythm.dataset.paused = String(state.paused)
      // La velocidad permanece visible incluso al pausar o abrir Ajustes: así
      // el lector puede comprobar que el deslizador sí se aplicó.
      el.hudRhythm.textContent = `${Math.round(state.wpm)} ppm`
      const action = state.paused ? 'Reanudar' : 'Pausar'
      el.hudRhythm.title = `${action} el ritmo · unidad estimada a ${Math.round(state.wpm)} palabras por minuto`
      el.hudRhythm.setAttribute('aria-label', `${action} la guía de ritmo`)
    },
    onAdvance: () => {
      if (!reader?.isOpen) return
      rhythmAdvance = true
      try { reader.move(1) } finally { rhythmAdvance = false }
      wakeHud()
    }
  })
  rhythm.configure({
    mode: settings.get('rhythmMode') ?? 'guided',
    targetWpm: settings.get('readingTargetWpm') ?? 180
  })
  if (settings.get('fullscreen')) await window.lector.app.setFullscreen(true)
  window.lector.onFullscreen(value => settings.update({ fullscreen: value }))
  speechPort = createOfflineSpeechPort()
  speech = createSpeechController({
    port: speechPort,
    onLocator: locator => reader?.goToLocator(locator, { animate: false }),
    onState: ({ state, error }) => {
      const active = state !== 'idle'
      el.hudSpeech.textContent = state === 'speaking' ? 'Pausar' : state === 'paused' ? 'Continuar' : 'Escuchar'
      el.hudSpeech.classList.toggle('is-on', active)
      el.hudSpeechPrev.hidden = !active
      el.hudSpeechNext.hidden = !active
      reader?.setSpeechActive?.(active)
      syncRhythmSuspension()
      if (error) toast(error.message, 5000)
    }
  })
  breakPrompt = createBreakPrompt({
    onPause: milliseconds => wellbeing.pauseFor(milliseconds),
    onPostpone: () => wellbeing.postpone(5),
    onDisable: () => settings.update({ breakInterval: 0 })
  })
  wellbeing = createWellbeingController({
    onBreak: () => {
      speech?.pause()
      breakPrompt.open()
    },
    onStats: data => {
      if (!settings.get('collectReadingStats') || !session?.entry) return
      void window.lector.stats.write(session.entry.id, data)
    }
  })
  if (window.lector.devStudy) {
    studyRecorder = createStudyRecorder()
    createStudyPanel({
      recorder: studyRecorder,
      onCondition: condition => {
        const mode = condition === 'sentence' ? 'sentence' : 'flow'
        const presentation = condition === 'paged' ? 'paged' : 'continuous'
        settings.update({
          focusEnabled: condition !== 'full',
          readingMode: mode,
          presentationMode: presentation
        })
        void switchMode(mode).then(() => {
          el.body.dataset.presentation = presentation
          reader?.setPresentation(presentation)
        })
        studyLastOffset = reader?.getLocator?.().offset ?? null
      },
      onExport: sessions => window.lector.study.export({ version: 1, sessions })
    })
  }

  bookSheet = createBookSheet({
    onStart: async mode => {
      session.patchEntry({ readingMode: mode })
      saveBookSettings({ ...session.entry.reading, readingMode: mode })
      entries = await window.lector.library.list()
      await enterReader()
    },
    onCancel: backToLibrary
  })
  document.body.append(bookSheet.element)

  // Los dos lectores comparten interfaz; solo uno esta abierto a la vez.
  const wiring = {
    stage: el.stage,
    sharpLayer: el.sharpLayer,
    contentSharp: el.contentSharp,
    contentDim: el.contentDim,
    onStatus,
    onSave: progress => {
      if (!session.entry) return
      return session.saveProgress(progress)
    }
  }
  readers = {
    flow: assertReaderController(createReader(wiring)),
    page: assertReaderController(createRegionReader(wiring))
  }
  reader = readers.flow
  gamepad = createGamepadAdapter({
    commands,
    mapping: {
      next: settings.get('gamepadNextButton') ?? 0,
      previous: settings.get('gamepadPreviousButton') ?? 1,
      pageNext: settings.get('gamepadPageNextButton') ?? 5,
      pagePrevious: settings.get('gamepadPagePreviousButton') ?? 4
    }
  })

  settingsPanel = createSettingsPanel({
    settings,
    currentMode: () => el.body.dataset.mode ?? 'flow',
    onReadingMode: choice => switchMode(resolveMode(session?.document?.book, choice)),
    onPresentation: choice => {
      el.body.dataset.presentation = choice
      reader?.setPresentation(choice)
    },
    onClose: () => showPanel(null),
    // El boton de OCR: visible mientras el libro tenga paginas que reconocer
    // y no haya ya una pasada en marcha.
    canRecognize: () => {
      const stats = session?.document?.book?.stats
      return Boolean(stats && !backgroundTasks.has('ocr') &&
        (stats.scannedPages ?? 0) + (stats.suspectPages ?? 0) > 0)
    },
    onRecognize: () => { showPanel(null); void maybeStartOcr({ forced: true }) },
    speechVoices: () => speechPort.voices(),
    onClearVocabulary: () => session?.entry && window.lector.vocabulary.clear(session.entry.id),
    onClearStats: () => {
      wellbeing?.resetStats()
      return session?.entry && window.lector.stats.clear(session.entry.id)
    }
  })
  notesView = createNotesView({
    onClose: () => showPanel(null),
    onGo: note => { navigateExplicit(note, 'note'); wakeHud() },
    onDelete: id => {
      const note = notes.all.find(n => n.id === id)
      notes.remove(id)
      if (note?.kind !== 'highlight') reader.refreshBookmarks?.()
      reader.refreshHighlights?.()
      reader.refreshStatus()
      notesView.render(notes.all, reader.book)
    },
    onEdit: (id, text) => notes.setText(id, text),
    onExport: exportNotes
  })
  searchView = createSearchPanel({
    onClose: () => showPanel(null),
    canBack: () => Boolean(session?.canReturn),
    onBack: returnToPreviousLocator,
    onSearch: query => {
      const book = session?.document?.book
      return (searchIndex?.search(query) ?? []).map(result => ({
        ...result,
        chapterTitle: book?.chapters?.[result.chapter]?.title
      }))
    },
    onGo: result => { navigateExplicit(result.locator, 'search'); wakeHud() }
  })
  const dictionaryProvider = createDictionaryProvider()
  dictionary = createDictionaryPopover({
    provider: dictionaryProvider,
    preferredLanguage: () => navigator.language?.toLowerCase().startsWith('en') ? 'en' : 'es',
    onRemember: (entry, word) => {
      if (!settings.get('vocabularyHistory') || !session?.entry) return
      void window.lector.vocabulary.add(session.entry.id, {
        word,
        lemma: entry.lemma,
        language: entry.language,
        lookedUpAt: Date.now(),
        locator: reader.getLocator()
      })
    }
  })
  shellController.registerPanels(settingsPanel, notesView, searchView)

  // Seleccionar texto ofrece resaltarlo con un color.
  attachHighlighter({
    container: $('view-reader'),
    content: el.contentSharp,
    onLookup: ({ word, rect }) => dictionary.lookup(word, rect),
    onHighlight: ({ startBlock, startChar, endBlock, endChar, quote, color }) => {
      const book = session?.document?.book
      if (!book || !notes) return
      const start = (book.blocks[startBlock]?.start ?? 0) + startChar
      const end = (book.blocks[endBlock]?.start ?? 0) + endChar
      if (end <= start) return
      notes.add({ offset: start, end, block: startBlock, char: startChar, quote, kind: 'highlight', color })
      reader.refreshHighlights?.()
      reader.refreshStatus()
      notesView.render(notes.all, book)
      wakeHud()
    }
  })
  scrubber = createScrubber({
    onGo: offset => { reader.goToLocator({ offset }); wakeHud() }
  })
  scrubber.setBook(null)
  $('view-reader').append(scrubber.element, settingsPanel.element, notesView.element, searchView.element)

  attachNavigation(el.stage, {
    move: delta => { commands.run('reader.move', delta); wakeHud() },
    page: direction => { commands.run('reader.page', direction); wakeHud() },
    jump: where => { reader.jump(where); wakeHud() },
    chapter: direction => { reader.chapter(direction); wakeHud() },
    bookmark: toggleBookmark,
    mode: toggleMode,
    escape: () => {
      if (!el.chapterMenu.hidden) closeChapterMenu()
      else if (settingsPanel.isOpen || notesView.isOpen || searchView.isOpen) showPanel(null)
      else if (reader.isOpen) backToLibrary()
    }
  })

  el.stage.addEventListener('mousemove', wakeHud)
  el.stage.addEventListener('pointerdown', () => wellbeing.activity())
  window.addEventListener('keydown', () => wellbeing.activity())
  el.hud.addEventListener('mouseenter', wakeHud)

  // Al cambiar el tamano de la ventana cambian los saltos de linea.
  let resizeTimer = null
  new ResizeObserver(() => {
    clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => reader.relayout(), 120)
  }).observe(el.stage)

  $('btn-open').addEventListener('click', pickAndOpen)
  $('hud-library').addEventListener('click', backToLibrary)
  $('hud-settings').addEventListener('click', () => showPanel('settings'))
  $('hud-notes').addEventListener('click', () => showPanel('notes'))
  $('hud-search').addEventListener('click', () => showPanel('search'))
  $('hud-dictionary').addEventListener('click', () => dictionary.openManual())
  el.hudRhythm.addEventListener('click', () => {
    rhythm.togglePause()
    wakeHud()
  })
  const toggleSpeech = () => {
    if (!reader?.isOpen || !session?.document) return
    if (speech.state === 'speaking') return speech.pause()
    if (speech.state === 'paused') return speech.resume()
    const requested = settings.get('speechLanguage') ?? 'auto'
    const excerpt = reader.getCurrentExcerpt()?.text?.toLowerCase() ?? ''
    const detected = /\b(the|and|of|to|was|were)\b/.test(excerpt) ? 'en' : 'es'
    const language = requested === 'auto' ? detected : requested
    const voices = speechPort.voices().filter(voice => voice.lang?.toLowerCase().startsWith(language))
    if (!voices.length) return toast('No hay una voz local disponible para este idioma.', 5000)
    speech.start(session.document.book, reader.getLocator(), {
      language,
      rate: settings.get('speechRate') ?? 1,
      voice: settings.get(language === 'es' ? 'speechVoiceEs' : 'speechVoiceEn') || voices[0].name,
      sleepTimer: settings.get('speechTimer') ?? 'off'
    })
  }
  el.hudSpeech.addEventListener('click', toggleSpeech)
  el.hudSpeechPrev.addEventListener('click', () => speech.previous())
  el.hudSpeechNext.addEventListener('click', () => speech.next())
  el.hudBack.addEventListener('click', returnToPreviousLocator)
  el.hudMode.addEventListener('click', toggleMode)
  el.hudBookmark.addEventListener('click', toggleBookmark)
  el.hudChapter.addEventListener('click', toggleChapterMenu)
  // Un clic fuera cierra el indice, como cualquier menu.
  document.addEventListener('click', event => {
    if (el.chapterMenu.hidden) return
    if (!el.chapterMenu.contains(event.target) && event.target !== el.hudChapter) {
      closeChapterMenu()
    }
  })

  window.lector.onMenu({
    'open-pdf': pickAndOpen,
    library: backToLibrary,
    settings: () => { if (reader.isOpen) showPanel('settings') },
    notes: () => { if (reader.isOpen) showPanel('notes') },
    search: () => { if (reader.isOpen) showPanel('search') }
  })

  commands.register('reader.search', () => { if (reader.isOpen) showPanel('search') })
  commands.register('reader.back', returnToPreviousLocator)
  commands.register('reader.move', delta => reader?.move(delta))
  commands.register('reader.page', direction => reader?.page(direction))
  commands.register('speech.toggle', toggleSpeech)
  gamepad.setEnabled(settings.get('gamepadEnabled'))
  window.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'f') {
      event.preventDefault()
      commands.run('reader.search')
    } else if (event.altKey && !event.ctrlKey && !event.metaKey && event.key === 'ArrowLeft') {
      event.preventDefault()
      commands.run('reader.back')
    } else if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === ' ') {
      event.preventDefault()
      commands.run('speech.toggle')
    }
  })
  globalThis.speechSynthesis?.addEventListener?.('voiceschanged', () => settingsPanel.refresh())
  window.addEventListener('focus', syncRhythmSuspension)
  window.addEventListener('blur', syncRhythmSuspension)
  document.addEventListener('visibilitychange', syncRhythmSuspension)

  // El almacen avisa si tuvo que apartar un fichero danado: hay que decirlo.
  window.lector.onStorageWarning(message => toast(message, 8000))
  window.lector.onNotice(message => toast(message, 8000))

  // Lo que se escape a cualquier catch acaba en el log de userData; empaquetada,
  // la consola del renderer no la ve nadie.
  window.addEventListener('error', event =>
    window.lector.log.error(`${event.message} (${event.filename}:${event.lineno})`))
  window.addEventListener('unhandledrejection', event =>
    window.lector.log.error(`unhandledrejection: ${event.reason?.stack ?? event.reason}`))

  // El proceso principal retiene el cierre hasta que estos cuatro almacenes
  // confirman sus escrituras. beforeunload queda como ultimo repuesto si el
  // sistema operativo destruye la ventana sin pasar por ese protocolo.
  let closeInProgress = false
  const flushApplication = async () => {
    if (closeInProgress) return
    closeInProgress = true
    backgroundTasks.cancelAll()
    speech?.stop()
    wellbeing?.stop()
    try {
      if (reader?.isOpen) await reader.close()
      await Promise.all([session.flush(), notes?.flush?.(), settings.flush()])
      await window.lector.app.flush()
    } finally {
      window.lector.app.closeReady()
    }
  }
  window.lector.onBeforeClose(() => { void flushApplication() })
  window.addEventListener('beforeunload', () => {
    if (reader?.isOpen) void reader.flush()
    void session.flush()
    void notes?.flush?.()
    void settings.flush()
    shellController.destroy()
    gamepad?.destroy()
  })

  await refreshLibrary()

  // La tarea de desarrollo "read" abre un libro concreto sin pasar por el dialogo.
  if (window.lector.devOpen) await openBook(window.lector.devOpen)
}

start().catch(err => {
  console.error(err)
  toast(`Error al arrancar: ${err.message}`, 8000)
})
