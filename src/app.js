// Arranque y cableado. Aqui no vive ninguna regla propia: solo se conectan la
// biblioteca, el lector, los ajustes y las notas, y se decide que se ve.

import { buildBook, CACHE_VERSION } from '/src/pdf/pipeline.js'
import { createReader } from '/src/reader/reader.js'
import { createRegionReader } from '/src/reader/regionReader.js'
import { attachNavigation } from '/src/reader/navigation.js'
import { createSettings } from '/src/settings/settings.js'
import { createSettingsPanel } from '/src/settings/settingsPanel.js'
import { createLibraryView } from '/src/library/libraryView.js'
import { createNotesStore } from '/src/notes/notesStore.js'
import { createNotesView } from '/src/notes/notesView.js'
import { percent } from '/src/ui/dom.js'

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
  hudProgress: $('hud-progress'),
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
let notes = null
let entries = []
let current = null // entrada de biblioteca del libro abierto
let openedBook = null // { book, path } del libro en pantalla
let lastOffset = 0 // ultimo punto de lectura, para conservarlo al cambiar de vista
let hudTimer = null

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
  onRemove: async entry => {
    entries = await window.lector.library.remove(entry.id)
    library.render(entries)
    toast(`«${entry.title}» quitado de la biblioteca`)
  }
})

// --- Apertura de libros ----------------------------------------------------

async function pickAndOpen () {
  const picked = await window.lector.pdf.pick()
  if (picked) await openLoaded(picked)
}

async function openBook (filePath, entry) {
  showLoading('Abriendo el libro…')
  const loaded = await window.lector.pdf.load(filePath)

  if (loaded?.error) {
    hideLoading()
    toast(loaded.error === 'missing'
      ? 'El archivo ya no está donde estaba. ¿Lo has movido?'
      : `No se pudo abrir: ${loaded.error}`, 5000)
    if (entry) {
      entries = await window.lector.library.upsert({ ...entry, missing: true })
      library.render(entries)
    }
    return
  }
  await openLoaded(loaded, entry)
}

/** Del PDF ya leido en memoria al lector, pasando por la cache si la hay. */
async function openLoaded (loaded, entry) {
  try {
    showLoading('Abriendo el libro…')
    const book = await loadOrBuild(loaded)

    // Un PDF escaneado es una imagen por pagina: no hay texto que extraer y
    // abrirlo dejaria la pantalla en blanco sin explicar por que.
    if (!book.blocks.length) {
      el.body.dataset.view = 'library'
      toast('Este PDF no contiene texto, probablemente sea un escaneo. No se puede leer con esta aplicación.', 7000)
      return
    }

    current = {
      id: loaded.id,
      path: loaded.path,
      title: book.title,
      author: book.author,
      pageCount: book.pageCount,
      addedAt: entry?.addedAt ?? Date.now(),
      lastOpenedAt: Date.now(),
      progress: entry?.progress ?? null,
      missing: false
    }
    entries = await window.lector.library.upsert(current)

    notes = createNotesStore(loaded.id)
    await notes.load()
    openedBook = { book, path: loaded.path }

    el.body.dataset.view = 'reader'
    // El maquetado necesita que la vista ya este visible para medir bien.
    await nextFrame()
    await applyMode(chooseMode(book), book, current.progress, loaded.bytes)
    notesView.render(notes.all, book)
    wakeHud()
  } catch (err) {
    console.error(err)
    toast(`No se pudo procesar el PDF: ${err.message}`, 6000)
    el.body.dataset.view = 'library'
  } finally {
    hideLoading()
  }
}

async function loadOrBuild (loaded) {
  const cached = await window.lector.book.readCache(loaded.id)
  if (cached?.version === CACHE_VERSION) return cached

  const book = await buildBook(loaded.bytes, {
    fileName: loaded.fileName,
    onProgress: (done, total) => showLoading(`Preparando el libro… página ${done} de ${total}`)
  })
  await window.lector.book.writeCache(loaded.id, book)
  return book
}

async function backToLibrary () {
  if (reader?.isOpen) reader.close()
  openedBook = null
  showPanel(null)
  // Un aviso de la lectura no tiene sentido ya en la estanteria.
  el.toast.hidden = true
  clearTimeout(toastTimer)
  current = null
  notes = null
  el.body.dataset.view = 'library'
  await refreshLibrary()
}

// --- Modos de lectura ------------------------------------------------------

/**
 * Con que vista se lee este libro.
 *
 * La prosa gana mucho re-maquetada: el texto se adapta a la pantalla y se lee
 * linea a linea. Un documento tecnico pierde con eso —las formulas, las tablas
 * y las graficas se desmontan—, asi que se muestra tal y como esta compuesto y
 * lo que se resalta es la region entera.
 */
function chooseMode (book) {
  const preference = settings.get('readingMode')
  if (preference !== 'auto') return preference

  const pages = Math.max(1, book.pageCount)
  const hasFigures = (book.stats.figures ?? 0) / pages > 0.15
  const hasColumns = (book.stats.columnPages ?? 0) / pages > 0.3
  return hasFigures || hasColumns ? 'page' : 'flow'
}

async function applyMode (mode, book, progress, bytes) {
  if (reader?.isOpen) reader.close()

  reader = readers[mode]
  el.body.dataset.mode = mode
  el.hudMode.textContent = mode === 'page' ? 'Página' : 'Flujo'
  el.hudMode.title = mode === 'page'
    ? 'Leyendo sobre la página original, región a región. Pulsa para re-maquetar el texto.'
    : 'Leyendo el texto re-maquetado, línea a línea. Pulsa para ver la página original.'

  reader.setFocusShape(settings.all)
  await reader.open(book, progress, notes, bytes)
}

async function toggleMode () {
  if (!reader?.isOpen || !openedBook) return
  const next = el.body.dataset.mode === 'page' ? 'flow' : 'page'

  // La eleccion manual manda a partir de ahora, tambien en los proximos libros.
  settings.update({ readingMode: next })
  showLoading('Cambiando de vista…')
  try {
    // La vista de pagina necesita el PDF para dibujarlo, no solo su texto.
    const loaded = await window.lector.pdf.load(openedBook.path)
    if (loaded?.error) return void toast('No se pudo releer el archivo')
    await applyMode(next, openedBook.book, { offset: lastOffset }, loaded.bytes)
  } finally {
    hideLoading()
  }
}

// --- HUD -------------------------------------------------------------------

function wakeHud () {
  el.hud.classList.remove('is-idle')
  clearTimeout(hudTimer)
  hudTimer = setTimeout(() => el.hud.classList.add('is-idle'), HUD_IDLE_MS)
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
  el.hudProgress.textContent = percent(status.percent)
  el.hudBookmark.classList.toggle('is-on', status.marked)
  lastOffset = status.offset
  // El punto de lectura exacto, para poder comprobarlo desde fuera.
  el.body.dataset.offset = String(status.offset)
}

// --- Marcadores ------------------------------------------------------------

function toggleBookmark () {
  const line = reader.currentLine()
  if (!line || !notes) return

  const existing = notes.find(line.offset)
  if (existing) {
    notes.remove(existing.id)
    toast('Marcador quitado')
  } else {
    notes.add({ offset: line.offset, block: line.block, char: line.char, quote: line.context })
    toast('Línea marcada')
  }

  reader.markBlock(line.block, notes.markedBlocks.has(line.block))
  reader.refreshStatus()
  notesView.render(notes.all, reader.book)
}

// --- Arranque --------------------------------------------------------------

const nextFrame = () => new Promise(resolve => requestAnimationFrame(() => resolve()))

async function start () {
  settings = createSettings(await window.lector.settings.read(), {
    onLayoutChange: () => reader?.relayout(),
    onChange: next => reader?.setFocusShape(next)
  })

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
      window.lector.library.upsert({ id: current.id, progress, lastOpenedAt: current.lastOpenedAt })
    }
  }
  readers = { flow: createReader(wiring), page: createRegionReader(wiring) }
  reader = readers.flow

  settingsPanel = createSettingsPanel({ settings, onClose: () => showPanel(null) })
  notesView = createNotesView({
    onClose: () => showPanel(null),
    onGo: note => { reader.goToOffset(note.offset); wakeHud() },
    onDelete: id => {
      const note = notes.all.find(n => n.id === id)
      notes.remove(id)
      if (note) reader.markBlock(note.block, notes.markedBlocks.has(note.block))
      reader.refreshStatus()
      notesView.render(notes.all, reader.book)
    },
    onEdit: (id, text) => notes.setText(id, text)
  })
  $('view-reader').append(settingsPanel.element, notesView.element)

  attachNavigation(el.stage, {
    move: delta => { reader.move(delta); wakeHud() },
    page: direction => { reader.page(direction); wakeHud() },
    jump: where => { reader.jump(where); wakeHud() },
    chapter: direction => { reader.chapter(direction); wakeHud() },
    bookmark: toggleBookmark,
    mode: toggleMode,
    escape: () => {
      if (settingsPanel.isOpen || notesView.isOpen) showPanel(null)
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

  window.lector.onMenu({
    'open-pdf': pickAndOpen,
    library: backToLibrary,
    settings: () => { if (reader.isOpen) showPanel('settings') },
    notes: () => { if (reader.isOpen) showPanel('notes') }
  })

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
