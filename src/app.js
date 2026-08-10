// Arranque y cableado. Aqui no vive ninguna regla propia: solo se conectan la
// biblioteca, el lector, los ajustes y las notas, y se decide que se ve.

import { buildBook, CACHE_VERSION } from '/src/pdf/pipeline.js'
import { buildBookInWorker } from '/src/pdf/ingestClient.js'
import { migrateBook, validateBook, reanchor, textOf } from '/src/pdf/migrate.js'
import { blockAtOffset, percentAt, chapterAtOffset } from '/src/reader/progress.js'
import { createReader } from '/src/reader/reader.js'
import { createRegionReader } from '/src/reader/regionReader.js'
import { attachNavigation } from '/src/reader/navigation.js'
import { createScrubber } from '/src/reader/scrubber.js'
import { createPace } from '/src/reader/pace.js'
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

const $ = id => document.getElementById(id)
const HUD_IDLE_MS = 2200

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
let scrubber = null
let pace = null
let savedCpm = 0
let notes = null
let entries = []
let current = null // entrada de biblioteca del libro abierto
let openedBook = null // { book, path } del libro en pantalla
let lastOffset = 0 // ultimo punto de lectura, para conservarlo al cambiar de vista
let bookSheet = null
let pendingSave = null // ultima escritura en la biblioteca, para no leerla antes de tiempo
let hudTimer = null
let ocrRun = null // reconocimiento en marcha del libro abierto
let layoutRun = null // analisis de layout en marcha del libro abierto

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
      el.body.dataset.view = 'library'
      toast('Este PDF no contiene ni texto ni páginas que mostrar. No se puede leer con esta aplicación.', 7000)
      return
    }

    if (book.stats?.suspectPages > 0 && !known) {
      // Solo la primera vez: el aviso repetido en cada apertura cansa mas de
      // lo que ayuda, y el libro no va a cambiar.
      toast(`Ojo: ${book.stats.suspectPages === 1 ? 'una página trae' : `${book.stats.suspectPages} páginas traen`} texto dudoso; si algo se lee raro, prueba la vista de página.`, 6000)
    }

    current = {
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
    entries = await window.lector.library.upsert(current)

    notes = createNotesStore(loaded.id)
    await notes.load()
    openedBook = {
      book,
      path: loaded.path,
      bytes: loaded.bytes,
      // Cajas del modelo de layout ya analizadas, si las hay: la vista de
      // pagina las prefiere a las heuristicas en esas paginas.
      layouts: await window.lector.layout.read(loaded.id)
    }


    // La ficha solo aparece la primera vez: reabrir un libro conocido lleva
    // directo al punto de lectura, que es lo que se quiere casi siempre.
    if (sheet || !current.readingMode) {
      hideLoading()
      el.body.dataset.view = 'sheet'
      bookSheet.render(book, { entry: current, title: current.progress ? 'Seguir leyendo' : 'Empezar a leer' })
      return
    }

    await enterReader()
  } catch (err) {
    console.error(err)
    toast(`No se pudo procesar el PDF: ${err.message}`, 6000)
    el.body.dataset.view = 'library'
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
  if (!book?.bytes || !current) return
  try {
    await makeCover(new Uint8Array(book.bytes), current.id)
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
  try {
    return await buildBookInWorker(bytes, options)
  } catch (err) {
    if (err?.name !== 'WorkerUnavailable') throw err
    window.lector.log.error(`ingesta sin worker: ${err.message}`)
    return buildBook(bytes, options)
  }
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
    await window.lector.notes.write(id, stored)
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
  const book = openedBook?.book
  if (!book || ocrRun || !current) return
  if (!((book.stats?.scannedPages ?? 0) + (book.stats?.suspectPages ?? 0) > 0)) return

  const stored = await window.lector.ocr.read(current.id)
  // Sin paginas por intentar no hay nada que reconocer: lo ya reconocido lo
  // aplico loadOrBuild al abrir. Arrancar un run vacio acababa en un onDone
  // inmediato que reconstruia el libro (con su aviso) en cada apertura.
  if (!unattemptedPages(book.pageKinds, stored?.pages).length) return
  const resumed = Object.keys(stored?.pages ?? {}).length > 0

  if (forced) {
    if (current.ocrDeclined) {
      current = { ...current, ocrDeclined: false }
      entries = await window.lector.library.upsert({ id: current.id, ocrDeclined: false })
    }
  } else {
    if (current.ocrDeclined) return
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
        current = { ...current, ocrDeclined: true }
        entries = await window.lector.library.upsert({ id: current.id, ocrDeclined: true })
        return
      }
    }
  }

  const id = current.id
  ocrRun = createOcrRun({
    id,
    book,
    bytes: openedBook.bytes,
    onProgress: (done, total) => setOcrChip(`Reconociendo texto… ${done}/${total}`),
    onDone: () => finishOcr(id),
    onError: err => {
      console.error(err)
      ocrRun = null
      setOcrChip(null)
      toast(`El reconocimiento falló: ${err.message}`, 6000)
    }
  })
  setOcrChip('Reconociendo texto…')
  wakeHud()
  void ocrRun.start()
}

/** Con todo reconocido, el libro se reconstruye ya con su texto. */
async function finishOcr (id) {
  ocrRun = null
  setOcrChip(null)
  // Si el libro ya no esta abierto, no se pierde nada: loadOrBuild aplica el
  // OCR guardado en la proxima apertura.
  if (!openedBook || current?.id !== id) return

  showLoading('Aplicando el texto reconocido…')
  try {
    const previous = openedBook.book
    const ocr = await window.lector.ocr.read(id)
    const book = await ingest(openedBook.bytes, { ocrItemsByPage: ocr?.pages })
    await window.lector.book.writeCache(id, book)
    // El progreso provisional (pagina a pagina) cae en el primer bloque de la
    // misma pagina del texto nuevo; las notas, por su cita o su pagina.
    await reanchorStored(id, previous, book, current)
    await notes.load()

    openedBook.book = book
    current = { ...current, title: book.title, scanned: isScanned(book) }
    entries = await window.lector.library.upsert({
      id, title: current.title, scanned: current.scanned, progress: current.progress
    })

    if (el.body.dataset.view === 'reader') {
      await applyMode(resolveMode(book, current.readingMode), book, current.progress, openedBook.bytes)
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
  const book = openedBook?.book
  if (!book || layoutRun || ocrRun || !current) return

  const pages = (book.pageRoles ?? [])
    .map((role, page) => role === 'opener' ? page : -1)
    .filter(page => page >= 0)
    .filter(page => !openedBook.layouts?.pages?.[page])
  if (!pages.length) return
  if (!await layoutAvailable()) return

  const id = current.id
  layoutRun = createLayoutRun({
    id,
    bytes: openedBook.bytes,
    pages,
    onProgress: (done, total) => setOcrChip(`Analizando páginas… ${done}/${total}`),
    onDone: stored => finishLayout(id, stored),
    onError: err => {
      // El modelo es un extra: si falla, las heuristicas siguen mandando.
      console.warn('layout:', err.message)
      layoutRun = null
      setOcrChip(null)
    }
  })
  void layoutRun.start()
}

/** Con las cajas listas, la vista de pagina reconstruye sus paradas. */
async function finishLayout (id, stored) {
  layoutRun = null
  setOcrChip(null)
  if (!openedBook || current?.id !== id) return

  openedBook.layouts = stored
  // Solo la vista de pagina usa las cajas; el flujo no se toca. Se recoloca
  // en el mismo offset: las paradas cambian, el punto de lectura no.
  if (el.body.dataset.view === 'reader' && el.body.dataset.mode === 'page') {
    reader.setLayouts?.(stored)
    await reader.open(openedBook.book, { offset: lastOffset }, notes, openedBook.bytes)
    reader.refreshStatus()
  }
}

async function backToLibrary () {
  // Lo reconocido hasta ahora queda guardado y se reanuda al reabrir.
  ocrRun?.cancel()
  ocrRun = null
  layoutRun?.cancel()
  layoutRun = null
  setOcrChip(null)
  if (reader?.isOpen) reader.close()
  // El cierre guarda el punto de lectura; sin esperarlo, la estanteria se
  // repinta con los datos de antes y el progreso parece no haberse movido.
  await pendingSave
  // Con el lector ya cerrado, el hilo esta libre para dibujar la portada.
  await drawCoverOf(openedBook)
  openedBook = null
  // Fuera de un libro mandan los ajustes globales otra vez.
  settings.useBook({})
  showPanel(null)
  closeChapterMenu()
  scrubber?.setBook(null)
  // Un aviso de la lectura no tiene sentido ya en la estanteria.
  el.toast.hidden = true
  clearTimeout(toastTimer)
  current = null
  notes = null
  el.body.dataset.view = 'library'
  await refreshLibrary()
}

/** De la ficha al lector, con los ajustes que ese libro tenga guardados. */
async function enterReader () {
  const { book, bytes } = openedBook
  settings.useBook(current.reading)

  try {
    el.body.dataset.view = 'reader'
    // El maquetado necesita que la vista ya este visible para medir bien.
    await nextFrame()
    await applyMode(resolveMode(book, current.readingMode), book, current.progress, bytes)
    notesView.render(notes.all, book)
    wakeHud()
    // Con el lector ya en pantalla: el reconocimiento y el analisis de
    // layout son de fondo.
    void maybeStartOcr()
    void maybeStartLayout()
  } catch (err) {
    // Sin esto, un fallo al abrir deja la pantalla en blanco sin decir nada.
    console.error(err)
    toast(`No se pudo abrir el libro: ${err.message}`, 6000)
    el.body.dataset.view = 'library'
  }
}

// --- Modos de lectura ------------------------------------------------------

async function applyMode (mode, book, progress, bytes) {
  if (reader?.isOpen) reader.close()

  // Linea y frase comparten lector: solo cambia por que avanza el foco.
  reader = isFlowMode(mode) ? readers.flow : readers.page
  el.body.dataset.mode = mode
  el.hudMode.textContent = MODES[mode].label
  el.hudMode.title = `${MODES[mode].hint}. Pulsa o usa V para cambiar de vista.`

  reader.setFocusShape(settings.all)
  reader.setLayouts?.(openedBook?.layouts ?? null)
  await reader.open(book, progress, notes, bytes, mode === 'sentence' ? 'sentence' : 'line')
  // La primera muestra tras abrir o cambiar de vista no debe cruzar saltos.
  pace?.reset()
  scrubber?.setBook(book)
  settingsPanel?.refresh()
}

/** Cambia de vista sin perder el punto de lectura. */
async function switchMode (next) {
  if (!reader?.isOpen || !openedBook || next === el.body.dataset.mode) return

  showLoading('Cambiando de vista…')
  try {
    // La vista de pagina necesita el PDF para dibujarlo, no solo su texto.
    // Los bytes siguen en memoria desde la apertura (openDocument trabaja
    // sobre una copia): releer el archivo y recalcular su hash por cada
    // pulsacion de V eran cientos de ms de disco para nada.
    await applyMode(next, openedBook.book, { offset: lastOffset }, openedBook.bytes)
  } finally {
    hideLoading()
  }
}

async function toggleMode () {
  // Un escaneado sin OCR no tiene texto que re-maquetar: V no lleva a ninguna
  // parte y conviene decir por que en vez de no hacer nada.
  if (openedBook?.book?.provisional) {
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
let bookSaveTimer = null
function saveBookSettings (reading) {
  if (!current) return
  current = { ...current, reading, readingMode: reading.readingMode ?? current.readingMode }
  // Capturado ahora: si el libro se cierra antes de que venza el plazo, se
  // guarda igualmente lo suyo y no lo del siguiente.
  const payload = { id: current.id, reading: current.reading, readingMode: current.readingMode }
  clearTimeout(bookSaveTimer)
  bookSaveTimer = setTimeout(() => window.lector.library.upsert(payload), 400)
}

// --- HUD -------------------------------------------------------------------

function wakeHud () {
  el.hud.classList.remove('is-idle')
  clearTimeout(hudTimer)
  hudTimer = setTimeout(() => {
    // Con el indice abierto el HUD se queda: es el contexto del menu.
    if (el.chapterMenu.hidden) el.hud.classList.add('is-idle')
  }, HUD_IDLE_MS)
}

// --- Paneles ---------------------------------------------------------------

/**
 * Abre un panel y cierra el otro. Con un panel abierto la columna de texto se
 * aparta para no quedar debajo, asi que el estado tiene que estar centralizado.
 * @param {'settings'|'notes'|null} which null los cierra todos
 */
function showPanel (which) {
  const target = which && !panelIsOpen(which) ? which : null

  settingsPanel[target === 'settings' ? 'open' : 'close']()
  notesView[target === 'notes' ? 'open' : 'close']()
  el.body.classList.toggle('has-panel', target !== null)
  if (target) wakeHud()
}

const panelIsOpen = which => which === 'settings' ? settingsPanel.isOpen : notesView.isOpen

function onStatus (status) {
  el.hudChapter.textContent = status.chapter
  el.hudChapter.disabled = (openedBook?.book?.chapters?.length ?? 0) < 2
  el.hudPage.textContent = status.page ? `p. ${status.page}` : ''
  el.hudPage.hidden = !status.page
  el.hudProgress.textContent = percent(status.percent)
  updateEta(status)
  el.hudBookmark.classList.toggle('is-on', status.marked)
  el.hudBookmark.setAttribute('aria-pressed', String(Boolean(status.marked)))
  lastOffset = status.offset
  scrubber?.setOffset(status.offset)
  // El punto de lectura exacto, para poder comprobarlo desde fuera.
  el.body.dataset.offset = String(status.offset)
}

/**
 * "~8 min": lo que queda de capitulo al ritmo real de este lector. La cifra
 * solo se ensena cuando hay muestras suficientes, y la velocidad aprendida se
 * guarda con los ajustes para no empezar de cero en la proxima sesion.
 */
function updateEta (status) {
  const book = openedBook?.book
  el.hudEta.hidden = true
  if (!book || book.provisional || status.chapterIndex == null) return

  pace?.record(status.offset, Date.now())

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

// --- Indice de capitulos -----------------------------------------------------

/** Despliega la lista de capitulos sobre el HUD; el actual, senalado. */
function toggleChapterMenu () {
  if (!el.chapterMenu.hidden) return closeChapterMenu()

  const book = openedBook?.book
  if (!book || book.chapters.length < 2) return

  const current = chapterAtOffset(book, lastOffset)
  el.chapterMenu.replaceChildren(...book.chapters.map((chapter, i) =>
    h('button', {
      class: i === current ? 'is-on' : '',
      role: 'menuitem',
      text: chapter.title,
      onclick: () => {
        closeChapterMenu()
        reader.goToOffset(book.blocks[chapter.start]?.start ?? 0)
        wakeHud()
      }
    })
  ))
  el.chapterMenu.hidden = false
  el.hudChapter.setAttribute('aria-expanded', 'true')
  el.chapterMenu.querySelector('.is-on')?.scrollIntoView({ block: 'center' })
  wakeHud()
}

function closeChapterMenu () {
  el.chapterMenu.hidden = true
  el.hudChapter.setAttribute('aria-expanded', 'false')
}

// --- Marcadores ------------------------------------------------------------

function toggleBookmark () {
  const line = reader.currentLine()
  if (!line || !notes) return

  // El HUD dice "marcado" mirando el ancla exacta (tras saltar a una nota
  // puede caer a mitad de linea), mientras la linea empieza en otro offset:
  // se miran los dos, o M crearia un duplicado de un marcador que ya se
  // ensena como puesto.
  const existing = notes.find(line.offset) ?? notes.find(lastOffset)
  if (existing) {
    notes.remove(existing.id)
    reader.markBlock(existing.block, notes.markedBlocks.has(existing.block))
    toast('Marcador quitado')
  } else {
    notes.add({ offset: line.offset, block: line.block, char: line.char, quote: line.context })
    reader.markBlock(line.block, notes.markedBlocks.has(line.block))
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

  const name = `${(current?.title ?? 'notas').replace(/[\\/:*?"<>|]/g, '')} — notas.md`
  const saved = await window.lector.notes.export(name, markdown)
  if (saved) toast(`Notas guardadas en ${saved}`, 6000)
}

// --- Arranque --------------------------------------------------------------

const nextFrame = () => new Promise(resolve => requestAnimationFrame(() => resolve()))

async function start () {
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
    onChange: next => reader?.setFocusShape(next),
    onBookChange: saveBookSettings
  })

  // El ritmo aprendido en otras sesiones es el punto de partida.
  savedCpm = settings.get('paceCpm') ?? 0
  pace = createPace(savedCpm)

  bookSheet = createBookSheet({
    onStart: async mode => {
      current = { ...current, readingMode: mode }
      saveBookSettings({ ...current.reading, readingMode: mode })
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
      if (!current) return
      current = { ...current, progress }
      pendingSave = window.lector.library.upsert({
        id: current.id, progress, lastOpenedAt: current.lastOpenedAt
      })
    }
  }
  readers = { flow: createReader(wiring), page: createRegionReader(wiring) }
  reader = readers.flow

  settingsPanel = createSettingsPanel({
    settings,
    currentMode: () => el.body.dataset.mode ?? 'flow',
    onReadingMode: choice => switchMode(resolveMode(openedBook?.book, choice)),
    onClose: () => showPanel(null),
    // El boton de OCR: visible mientras el libro tenga paginas que reconocer
    // y no haya ya una pasada en marcha.
    canRecognize: () => {
      const stats = openedBook?.book?.stats
      return Boolean(stats && !ocrRun &&
        (stats.scannedPages ?? 0) + (stats.suspectPages ?? 0) > 0)
    },
    onRecognize: () => { showPanel(null); void maybeStartOcr({ forced: true }) }
  })
  notesView = createNotesView({
    onClose: () => showPanel(null),
    onGo: note => { reader.goToOffset(note.offset); wakeHud() },
    onDelete: id => {
      const note = notes.all.find(n => n.id === id)
      notes.remove(id)
      if (note) reader.markBlock(note.block, notes.markedBlocks.has(note.block))
      reader.refreshHighlights?.()
      reader.refreshStatus()
      notesView.render(notes.all, reader.book)
    },
    onEdit: (id, text) => notes.setText(id, text),
    onExport: exportNotes
  })

  // Seleccionar texto ofrece resaltarlo con un color.
  attachHighlighter({
    container: $('view-reader'),
    content: el.contentSharp,
    onHighlight: ({ startBlock, startChar, endBlock, endChar, quote, color }) => {
      const book = openedBook?.book
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
    onGo: offset => { reader.goToOffset(offset); wakeHud() }
  })
  scrubber.setBook(null)
  $('view-reader').append(scrubber.element, settingsPanel.element, notesView.element)

  attachNavigation(el.stage, {
    move: delta => { reader.move(delta); wakeHud() },
    page: direction => { reader.page(direction); wakeHud() },
    jump: where => { reader.jump(where); wakeHud() },
    chapter: direction => { reader.chapter(direction); wakeHud() },
    bookmark: toggleBookmark,
    mode: toggleMode,
    escape: () => {
      if (!el.chapterMenu.hidden) closeChapterMenu()
      else if (settingsPanel.isOpen || notesView.isOpen) showPanel(null)
      else if (reader.isOpen) backToLibrary()
    }
  })

  el.stage.addEventListener('mousemove', wakeHud)
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
    notes: () => { if (reader.isOpen) showPanel('notes') }
  })

  // El almacen avisa si tuvo que apartar un fichero danado: hay que decirlo.
  window.lector.onStorageWarning(message => toast(message, 8000))

  // Lo que se escape a cualquier catch acaba en el log de userData; empaquetada,
  // la consola del renderer no la ve nadie.
  window.addEventListener('error', event =>
    window.lector.log.error(`${event.message} (${event.filename}:${event.lineno})`))
  window.addEventListener('unhandledrejection', event =>
    window.lector.log.error(`unhandledrejection: ${event.reason?.stack ?? event.reason}`))

  // Guardar el punto de lectura aunque se cierre la ventana de golpe.
  window.addEventListener('beforeunload', () => { if (reader.isOpen) reader.close() })

  await refreshLibrary()

  // La tarea de desarrollo "read" abre un libro concreto sin pasar por el dialogo.
  if (window.lector.devOpen) await openBook(window.lector.devOpen)
}

start().catch(err => {
  console.error(err)
  toast(`Error al arrancar: ${err.message}`, 8000)
})
