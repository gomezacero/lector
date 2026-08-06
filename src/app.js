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
import { resolveMode, MODES } from '/src/reader/mode.js'
import { createBookSheet } from '/src/library/bookSheet.js'
import { makeCover } from '/src/pdf/pageRender.js'

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
let bookSheet = null
let pendingSave = null // ultima escritura en la biblioteca, para no leerla antes de tiempo
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
  onSheet: entry => openBook(entry.path, entry, { sheet: true }),
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

async function openBook (filePath, entry, options) {
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
  await openLoaded(loaded, entry, options)
}

/**
 * Del PDF ya leido en memoria al lector, pasando por la cache si la hay.
 * @param {Object} [options]
 * @param {boolean} [options.sheet] forzar la ficha aunque el libro ya se conozca
 */
async function openLoaded (loaded, entry, { sheet = false } = {}) {
  try {
    showLoading('Abriendo el libro…')
    const book = await loadOrBuild(loaded)

    // Abrir por el dialogo un libro que ya esta en la biblioteca no trae su
    // ficha: sin recuperarla aqui, el progreso y el modo se sobrescribirian y
    // se perderia por donde iba la lectura.
    const known = entry ?? entries.find(e => e.id === loaded.id)

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
    openedBook = { book, path: loaded.path, bytes: loaded.bytes }


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
  // El cierre guarda el punto de lectura; sin esperarlo, la estanteria se
  // repinta con los datos de antes y el progreso parece no haberse movido.
  await pendingSave
  // Con el lector ya cerrado, el hilo esta libre para dibujar la portada.
  await drawCoverOf(openedBook)
  openedBook = null
  // Fuera de un libro mandan los ajustes globales otra vez.
  settings.useBook({})
  showPanel(null)
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

  reader = readers[mode]
  el.body.dataset.mode = mode
  el.hudMode.textContent = MODES[mode].label
  el.hudMode.title = `${MODES[mode].hint}. Pulsa o usa V para cambiar de vista.`

  reader.setFocusShape(settings.all)
  await reader.open(book, progress, notes, bytes)
  settingsPanel?.refresh()
}

/** Cambia de vista sin perder el punto de lectura. */
async function switchMode (next) {
  if (!reader?.isOpen || !openedBook || next === el.body.dataset.mode) return

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

async function toggleMode () {
  const next = el.body.dataset.mode === 'page' ? 'flow' : 'page'
  // El modo es del libro, no de la aplicacion: cambiarlo aqui no toca los demas.
  settings.update({ readingMode: next })
  await switchMode(next)
}

/** Guarda en la biblioteca los ajustes de lectura del libro abierto. */
function saveBookSettings (reading) {
  if (!current) return
  current = { ...current, reading, readingMode: reading.readingMode ?? current.readingMode }
  window.lector.library.upsert({
    id: current.id,
    reading: current.reading,
    readingMode: current.readingMode
  })
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
    onChange: next => reader?.setFocusShape(next),
    onBookChange: saveBookSettings
  })

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
    onClose: () => showPanel(null)
  })
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
