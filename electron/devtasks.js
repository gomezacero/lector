// Tareas de desarrollo que necesitan un navegador de verdad.
//
// El pipeline vive en el renderer porque pdf.js necesita Worker y DOM, asi que
// no se puede probar con Node a secas. Estas tareas arrancan Electron, ejecutan
// algo concreto y salen con codigo 0 o 1, de forma que se puedan encadenar como
// cualquier otro comando.
//
//   LECTOR_TASK=smoke  npx electron .
//   LECTOR_TASK=ingest LECTOR_TASK_ARG=test/fixtures/libro-prueba.pdf npx electron .

import { promises as fs } from 'node:fs'
import path from 'node:path'

const errors = []

export function attachErrorLog (win) {
  win.webContents.on('console-message', event => {
    const level = ['debug', 'info', 'warning', 'error'][event.level] ?? 'info'
    if (level === 'error') errors.push(`[error] ${event.message}`)
    console.log(`[renderer:${level}] ${event.message}`)
  })
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    errors.push(`did-fail-load ${code} ${desc} ${url}`)
  })
  win.webContents.on('render-process-gone', (_e, details) => {
    errors.push(`render-process-gone ${details.reason}`)
  })
}

export function startUrlFor (task, arg) {
  if (task === 'ingest') {
    return `app://lector/src/dev/ingest.html?pdf=${encodeURIComponent(arg ?? '')}`
  }
  if (task === 'ocr') {
    return `app://lector/src/dev/ocr.html?pdf=${encodeURIComponent(arg ?? '')}`
  }
  if (task === 'layout') {
    // "archivo.pdf#2,3,24" corre el modelo sobre esas paginas.
    const [pdf, pages] = (arg ?? '').split('#')
    return `app://lector/src/dev/layout.html?pdf=${encodeURIComponent(pdf)}&pages=${encodeURIComponent(pages ?? '1')}`
  }
  if (task === 'icon') return 'app://lector/src/dev/icon.html'
  // Trabaja contra el almacen, no contra la interfaz: arrancar la aplicacion
  // solo la pondria a escribir en el userData que la prueba esta midiendo.
  if (task === 'wipe') return 'about:blank'
  if (task === 'home') return 'app://lector/src/index.html'
  if (task === 'diagnose') {
    // "archivo.pdf#12" vuelca las lineas de la pagina 12 en vez del informe.
    const [pdfs, page] = (arg ?? '').split('#')
    const query = `pdfs=${encodeURIComponent(pdfs)}${page ? `&page=${encodeURIComponent(page)}` : ''}`
    return `app://lector/src/dev/diagnose.html?${query}`
  }
  return 'app://lector/src/index.html'
}

const TASKS = {
  ingest: ingestTask,
  ocr: ocrTask,
  layout: layoutTask,
  diagnose: diagnoseTask,
  read: readTask,
  home: homeTask,
  icon: iconTask,
  smoke: smokeTask,
  wipe: wipeTask
}

/**
 * Comprueba que borrar un libro lo borra entero y que el barrido de huerfanos
 * no se lleva por delante lo que no debe.
 *
 * Como toda tarea de desarrollo, trabaja sobre el userData de usar y tirar que
 * main.js prepara y vacia en cada arranque. Es la unica forma honesta de probar
 * esto: contra la biblioteca real, la prueba seria el desastre que evita.
 */
async function wipeTask () {
  const { app } = await import('electron')
  const store = await import('./storage.js')
  const root = app.getPath('userData')

  const checks = []
  const check = (label, ok, detail = '') => {
    checks.push({ label, ok, detail })
    console.log(`  ${ok ? 'ok  ' : 'FALLO'} ${label}${detail ? ` — ${detail}` : ''}`)
  }
  // Solo lo que escribe la aplicacion: el userData comparte sitio con las
  // cachees de Chromium, que no son asunto de esta prueba.
  const tree = async () => {
    const found = []
    for (const dir of ['books', 'covers']) {
      for (const name of await fs.readdir(path.join(root, dir)).catch(() => [])) {
        found.push(`${dir}/${name}`)
      }
    }
    for (const name of await fs.readdir(root).catch(() => [])) {
      if (name === 'library.json' || name === 'settings.json' || name.endsWith('.tmp')) {
        found.push(name)
      }
    }
    return found.sort()
  }

  const id = 'a'.repeat(32)
  const otro = 'b'.repeat(32)

  console.log('\nBORRADO DE UN LIBRO')
  await store.upsertLibraryEntry({ id, title: 'Libro de prueba', progress: { percent: 0.31 } })
  await store.writeBookCache(id, { version: 3, blocks: new Array(500).fill({ text: 'x'.repeat(80) }) })
  await store.writeNotes(id, [{ offset: 10, quote: 'una nota' }])
  await store.writeCover(id, Buffer.from('imagen falsa de portada'))

  const antes = await tree()
  const suyos = [`books/${id}.json`, `books/${id}.notes.json`, `covers/${id}.jpg`]
  check('el libro deja sus tres ficheros mas la entrada',
    suyos.every(f => antes.includes(f)) && antes.includes('library.json'),
    antes.join(', '))

  const usage = await store.bookUsage(id)
  check('bookUsage cuenta las notas y los bytes', usage.notes === 1 && usage.bytes > 0,
    `${usage.notes} nota(s), ${usage.bytes} bytes`)

  const result = await store.removeLibraryEntry(id)
  const despues = await tree()
  check('el borrado dice que fue bien', result.ok === true)
  check('el borrado informa de lo liberado', result.bytes > 0, `${result.bytes} bytes`)
  check('no queda nada del libro', despues.length === 1 && despues[0] === 'library.json',
    despues.length ? despues.join(', ') : '(vacio)')

  console.log('\nTEMPORALES DE UNA ESCRITURA A MEDIAS')
  await store.upsertLibraryEntry({ id, title: 'Otra vez' })
  await store.writeBookCache(id, { version: 3, blocks: [] })
  // Los del esquema viejo, de nombre fijo, y los de ahora, con nombre propio.
  await fs.writeFile(path.join(root, 'books', `${id}.json.tmp`), 'a medias')
  await fs.writeFile(path.join(root, 'books', `${id}.notes.json.9999-1.tmp`), 'a medias')
  await store.removeLibraryEntry(id)
  const trasTmp = await tree()
  check('el borrado se lleva tambien los temporales',
    trasTmp.every(f => !f.includes('.tmp')), trasTmp.join(', ') || '(vacio)')

  console.log('\nBARRIDO DE HUERFANOS')
  const viejo = Date.now() - 48 * 60 * 60 * 1000
  await store.upsertLibraryEntry({ id, title: 'El que se queda' })
  await store.writeBookCache(id, { version: 3, blocks: [] })
  await store.writeBookCache(otro, { version: 3, blocks: [] })
  const huerfano = path.join(root, 'books', `${otro}.json`)
  await fs.utimes(huerfano, viejo / 1000, viejo / 1000)

  const barrido = await store.sweepOrphans()
  const trasBarrido = await tree()
  check('barre el cache sin dueno', barrido.swept === 1, `${barrido.swept} fichero(s)`)
  check('respeta el libro que si tiene entrada',
    trasBarrido.includes(`books/${id}.json`))

  // Un cache recien escrito puede no tener aun su entrada en la biblioteca.
  await store.writeBookCache(otro, { version: 3, blocks: [] })
  const barrido2 = await store.sweepOrphans()
  check('no toca un huerfano recien escrito', barrido2.swept === 0)

  console.log('\nGUARDAS DEL BARRIDO')
  await fs.writeFile(path.join(root, 'library.json'), '{ esto no es json')
  const corrupto = await store.sweepOrphans()
  check('con la biblioteca ilegible no barre nada',
    corrupto.swept === 0 && corrupto.skipped === 'biblioteca ilegible', corrupto.skipped ?? '')

  await fs.writeFile(path.join(root, 'library.json'), '[]')
  const vacia = await store.sweepOrphans()
  check('con la biblioteca vacia no barre nada',
    vacia.swept === 0 && vacia.skipped === 'biblioteca vacia', vacia.skipped ?? '')

  const sobrevive = await tree()
  check('los dos cache siguen ahi tras las dos guardas',
    sobrevive.filter(f => f.startsWith('books/')).length === 2,
    sobrevive.filter(f => f.startsWith('books/')).join(', '))

  console.log('\nTEMPORAL SUELTO EN LA RAIZ')
  // El que dejo el esquema viejo de nombre fijo: nadie lo nombra ni lo mira.
  await store.upsertLibraryEntry({ id, title: 'El que se queda' })
  const suelto = path.join(root, 'library.json.tmp')
  await fs.writeFile(suelto, '{"a medio escribir": true}')
  await fs.utimes(suelto, viejo / 1000, viejo / 1000)
  await store.sweepOrphans()
  check('barre el temporal suelto de la raiz',
    !(await tree()).includes('library.json.tmp'))

  await fs.rm(path.join(root, 'books'), { recursive: true, force: true })
  await fs.rm(path.join(root, 'covers'), { recursive: true, force: true })
  await fs.rm(path.join(root, 'library.json'), { force: true })



  const fallos = checks.filter(c => !c.ok)
  console.log(fallos.length
    ? `\nWIPE FALLO: ${fallos.length} de ${checks.length} comprobaciones`
    : `\nWIPE OK: ${checks.length} comprobaciones`)
  return fallos.length ? 1 : 0
}

/** Captura la estanteria tal y como queda con los libros ya en la biblioteca. */
async function homeTask (win, projectRoot) {
  const js = expression => win.webContents.executeJavaScript(expression)
  await poll(win, '["library", "sheet", "reader"].includes(document.body.dataset.view) || null', 60_000)
  await poll(win, 'document.getElementById("loading").hidden || null', 90_000)

  // Si arranco abriendo un libro, se vuelve a la estanteria para retratarla.
  await js('document.body.dataset.view === "library" || document.getElementById("hud-library")?.click() || document.querySelector(".sheet-back")?.click()')
  await wait(1500)

  const shotDir = path.join(projectRoot, 'test', 'screenshots')
  await fs.mkdir(shotDir, { recursive: true })
  const image = await win.webContents.capturePage()
  await fs.writeFile(path.join(shotDir, 'home.png'), image.toPNG())

  const state = await js(`
    (() => ({
      view: document.body.dataset.view,
      resume: document.querySelector('.resume-title')?.textContent ?? null,
      books: document.querySelectorAll('.book').length,
      // Uno por libro, franja incluida: el ultimo abierto se quedaba sin el.
      removeButtons: document.querySelectorAll('.book-remove').length,
      covers: [...document.querySelectorAll('.cover-image')]
        .filter(img => img.complete && img.naturalWidth > 0).length,
      orders: [...document.querySelectorAll('.shelf-order button')].map(b => b.textContent)
    }))()
  `)

  console.log('\nESTANTERIA')
  console.log(`  vista           : ${state.view}`)
  console.log(`  seguir leyendo  : ${state.resume ?? '(ninguno)'}`)
  console.log(`  libros          : ${state.books}`)
  console.log(`  portadas listas : ${state.covers}`)
  console.log(`  ordenaciones    : ${state.orders.join(', ')}`)
  console.log('  captura en test/screenshots/home.png')

  // Todo libro visible tiene que poder borrarse. El de la franja se quedaba
  // fuera, y es justo el que mas apetece quitar: el ultimo que se abrio.
  const visibles = state.books + (state.resume ? 1 : 0)
  const borrables = state.removeButtons === visibles
  console.log(`  se pueden borrar: ${state.removeButtons} de ${visibles}${borrables ? '' : '  <-- FALLO'}`)

  const dialogo = state.removeButtons ? await confirmDialogCheck(win, shotDir) : null
  return state.view === 'library' && borrables && dialogo !== false ? 0 : 1
}

/**
 * Cuantas paradas hay entre el principio del documento y el primer texto que se
 * lee. Es lo que el lector se ahorra al abrir, y lo que le costaria recorrer la
 * cubierta y el indice si fuera a buscarlos con Inicio.
 */
async function countPreliminaries (js) {
  const target = await js('Number(document.body.dataset.offset)')
  if (!target) return null

  // Inicio lleva al principio de verdad del documento, cubierta incluida.
  await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))`)
  await wait(600)
  const from = await js('Number(document.body.dataset.offset)')
  if (from >= target) return null

  let stops = 0
  let last = from
  // Tope generoso: sin plegar, el indice de un manual pasa de las quinientas.
  while (stops < 1500) {
    await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))`)
    stops++
    const offset = await js('Number(document.body.dataset.offset)')
    // Si deja de avanzar es que llego al final de lo que hay antes del cuerpo.
    if (offset >= target || offset === last) break
    last = offset
  }
  return { stops, bodyStart: target }
}

/**
 * Abre la confirmacion de borrado, la retrata y cancela.
 *
 * Lo que de verdad se comprueba es lo ultimo: que cancelar no borre. Un
 * dialogo que se salta al pulsar Cancelar es peor que no tenerlo, porque
 * promete una salida que no existe.
 */
async function confirmDialogCheck (win, shotDir) {
  const js = expression => win.webContents.executeJavaScript(expression)

  const antes = await js('document.querySelectorAll(".book-remove").length')
  await js('document.querySelector(".book-remove").click()')
  await wait(700)

  const dialog = await js(`
    (() => {
      const d = document.querySelector('dialog.confirm')
      if (!d) return null
      return {
        abierto: d.open,
        titulo: d.querySelector('.confirm-title')?.textContent ?? '',
        lineas: [...d.querySelectorAll('.confirm-list li')].map(li => li.textContent),
        // El foco tiene que estar en Cancelar: un Enter de mas no puede borrar.
        foco: document.activeElement?.textContent ?? ''
      }
    })()
  `)

  if (!dialog?.abierto) {
    console.log('  confirmacion   : NO APARECE  <-- FALLO')
    return false
  }

  await fs.writeFile(path.join(shotDir, 'confirmar-borrado.png'),
    (await win.webContents.capturePage()).toPNG())

  await js('document.querySelector("dialog.confirm .btn:not(.btn-danger)").click()')
  await wait(500)
  const despues = await js('document.querySelectorAll(".book-remove").length')
  const cancelaBien = despues === antes && !(await js('Boolean(document.querySelector("dialog.confirm"))'))

  console.log(`\nCONFIRMACION DE BORRADO`)
  console.log(`  titulo          : ${dialog.titulo}`)
  for (const linea of dialog.lineas) console.log(`  · ${linea}`)
  console.log(`  foco inicial    : ${dialog.foco}${dialog.foco === 'Cancelar' ? '' : '  <-- FALLO'}`)
  console.log(`  cancelar respeta: ${despues} de ${antes} libros${cancelaBien ? '' : '  <-- FALLO'}`)
  console.log('  captura en test/screenshots/confirmar-borrado.png')

  return cancelaBien && dialog.foco === 'Cancelar'
}

export function runDevTask (app, win, projectRoot, task, arg) {
  // Empaquetada, la aplicacion es una GUI sin consola: lo que se escriba en
  // stdout no lo ve nadie. Se guarda una copia de todo en un archivo.
  const outRoot = app.isPackaged ? path.join(app.getPath('temp'), 'lector-devtask') : projectRoot
  const transcript = []
  const realLog = console.log
  console.log = (...args) => {
    transcript.push(args.map(String).join(' '))
    realLog(...args)
  }

  win.webContents.once('did-finish-load', async () => {
    let code = 1
    try {
      const run = TASKS[task] ?? smokeTask
      code = await run(win, outRoot, arg)
    } catch (err) {
      console.log(`Tarea "${task}" fallo: ${err.stack ?? err.message}`)
    }
    if (errors.length) {
      console.log(`\nERRORES DEL RENDERER:\n${errors.join('\n')}`)
      code = 1
    }

    console.log(`\nRESULTADO: ${code === 0 ? 'OK' : 'FALLO'} (codigo ${code})`)
    try {
      await fs.mkdir(outRoot, { recursive: true })
      await fs.writeFile(path.join(outRoot, 'dev-report.txt'), transcript.join('\n'))
      realLog(`informe en ${path.join(outRoot, 'dev-report.txt')}`)
    } catch (err) {
      realLog(`no se pudo escribir el informe: ${err.message}`)
    }
    app.exit(code)
  })
}

async function smokeTask (win) {
  await wait(1200)
  const ok = await win.webContents.executeJavaScript(
    'Boolean(window.lector && document.getElementById("btn-open"))'
  )
  console.log(ok ? 'SMOKE OK: renderer y puente listos' : 'SMOKE FALLO: falta el puente')
  return ok ? 0 : 1
}

/**
 * Corre Tesseract sobre las primeras paginas de un PDF y deja dos cosas:
 *
 *  - test/fixtures/ocr-tesseract.json: la salida real de Tesseract (podada),
 *    con la que ocr.test.js prueba toItems sin arrancar Electron.
 *  - test/fixtures/escaneado-texto.pdf: las mismas paginas convertidas en un
 *    "escaneado" de verdad —una imagen por pagina, sin texto nativo— cuyo
 *    contenido se conoce, para probar el OCR de la aplicacion contra el.
 *
 * Es tambien la prueba de arranque: si la CSP bloquea el worker o el WASM,
 * es aqui donde se ve el error.
 */
async function ocrTask (win, projectRoot, arg) {
  const result = await poll(win, 'window.__ocr', 300_000)
  if (!result) {
    console.error('OCR: la pagina no publico resultado a tiempo')
    return 1
  }
  if (!result.ok) {
    console.error(`OCR FALLO: ${result.error}`)
    return 1
  }

  const outDir = path.join(projectRoot, 'test', 'fixtures')
  const first = result.results[0]
  await fs.writeFile(path.join(outDir, 'ocr-tesseract.json'), JSON.stringify({
    scale: result.scale,
    width: first.width,
    height: first.height,
    confidence: first.confidence,
    blocks: first.blocks
  }, null, 1))

  const { buildScanPdf } = await import(`file://${path.join(projectRoot, 'test', 'fixtures', 'make-scan.mjs')}`)
  const jpegs = result.jpegs.map(j => ({ data: Buffer.from(j.data, 'base64'), width: j.width, height: j.height }))
  const pageSize = { w: Math.round(first.width), h: Math.round(first.height) }
  await fs.writeFile(path.join(outDir, 'escaneado-texto.pdf'),
    buildScanPdf(jpegs, { w: pageSize.w, h: pageSize.h, folio: false }))

  const chars = result.results.reduce((n, r) => n + r.items.reduce((m, i) => m + i.text.length, 0), 0)
  console.log('\nOCR OK')
  console.log(`  arranque  : ${(result.booted / 1000).toFixed(1)}s (worker + WASM + idiomas, todo local)`)
  for (const [i, r] of result.results.entries()) {
    console.log(`  pagina ${i + 1}  : ${r.items.length} lineas, confianza ${(r.confidence * 100).toFixed(0)}%, ${(r.ms / 1000).toFixed(1)}s`)
  }
  console.log(`  caracteres: ${chars}`)
  console.log(`\n--- primeros bloques reconstruidos por el pipeline ---`)
  for (const text of result.blockTexts.slice(0, 4)) {
    console.log(`  ${text.slice(0, 110)}`)
  }
  console.log(`\nfixtures en test/fixtures/ocr-tesseract.json y escaneado-texto.pdf`)
  return 0
}

/**
 * Pasa el modelo de layout por paginas concretas y deja cada una anotada en
 * test/screenshots/layout-p<N>.png: las cajas que ve el modelo, con clase y
 * confianza. Es la forma de evaluar si el detector merece entrar en la
 * aplicacion antes de escribir una sola linea de integracion.
 */
async function layoutTask (win, projectRoot) {
  const result = await poll(win, 'window.__layout', 300_000)
  if (!result) {
    console.error('LAYOUT: la pagina no publico resultado a tiempo')
    return 1
  }
  if (!result.ok) {
    console.error(`LAYOUT FALLO: ${result.error}`)
    return 1
  }

  const shotDir = path.join(projectRoot, 'test', 'screenshots')
  await fs.mkdir(shotDir, { recursive: true })

  // Las detecciones crudas tambien como fixture: con ellas se prueba el orden
  // de lectura y el mapeo a regiones sin arrancar ni Electron ni el modelo.
  await fs.writeFile(
    path.join(projectRoot, 'test', 'fixtures', 'layout-detections.json'),
    JSON.stringify(result.results.map(r => ({ page: r.page, detections: r.detections })), null, 1))

  console.log('\nLAYOUT OK')
  console.log(`  arranque : ${(result.booted / 1000).toFixed(1)}s (WASM + modelo, todo local)`)
  for (const r of result.results) {
    await fs.writeFile(path.join(shotDir, `layout-p${r.page}.png`), Buffer.from(r.image, 'base64'))
    console.log(`\n  pagina ${r.page} — ${r.detections.length} cajas en ${(r.ms / 1000).toFixed(1)}s`)
    for (const d of r.detections) {
      console.log(`    ${d.label.padEnd(15)} ${String(Math.round(d.score * 100)).padStart(3)}%  x=${d.x} y=${d.y} ${d.w}x${d.h}`)
    }
  }
  console.log(`\npaginas anotadas en test/screenshots/layout-p*.png`)
  return 0
}

async function ingestTask (win, projectRoot, arg) {
  const result = await poll(win, 'window.__ingest', 60_000)
  if (!result) {
    console.error('INGEST: la pagina no publico resultado a tiempo')
    return 1
  }
  if (!result.ok) {
    console.error(`INGEST FALLO: ${result.error}`)
    return 1
  }

  // Un archivo por PDF: si todos escribieran en el mismo, procesar otro libro
  // dejaria los tests comparando contra el fixture equivocado.
  const outDir = path.join(projectRoot, 'test', 'fixtures')
  const stem = path.basename(arg ?? 'libro', '.pdf')
  await fs.writeFile(path.join(outDir, `ingest-${stem}.json`), JSON.stringify(result.book, null, 2))
  await fs.writeFile(path.join(outDir, `ingest-${stem}-pages.json`), JSON.stringify(result.pages))

  const { book } = result
  console.log(`\nINGEST OK`)
  console.log(`  titulo    : ${book.title}`)
  console.log(`  autor     : ${book.author || '(sin autor)'}`)
  console.log(`  paginas   : ${book.pageCount}`)
  console.log(`  bloques   : ${book.blocks.length} (${book.blocks.filter(b => b.type === 'heading').length} titulos)`)
  console.log(`  capitulos : ${book.chapters.map(c => c.title).join(' | ')}`)
  console.log(`  palabras  : ${book.stats.words}`)
  console.log(`  estilo    : ${book.stats.paragraphStyle}, cuerpo ${book.stats.bodySize}pt`)
  if (result.timing) {
    console.log(`  ingesta   : ${(result.timing.ms / 1000).toFixed(2)}s ` +
                `(${result.timing.perPage.toFixed(1)}ms/pagina, ${(result.timing.bytes / 1048576).toFixed(1)}MB)`)
  }
  console.log(`\n--- primeros bloques ---`)
  for (const block of book.blocks.slice(0, 6)) {
    console.log(`  [${block.type}] ${block.text.slice(0, 150)}${block.text.length > 150 ? '…' : ''}`)
  }
  return 0
}

/**
 * Recorre el uso real de la aplicacion: abrir, leer, cambiar ajustes, marcar,
 * volver a la biblioteca y reabrir. Comprueba las invariantes por el camino y
 * deja capturas en test/screenshots.
 */
async function readTask (win, projectRoot) {
  const js = expression => win.webContents.executeJavaScript(expression)
  const problems = []
  const check = (ok, message) => { if (!ok) problems.push(message) }

  const shotDir = path.join(projectRoot, 'test', 'screenshots')
  await fs.mkdir(shotDir, { recursive: true })
  let lastImage = null
  const shoot = async name => {
    lastImage = await win.webContents.capturePage()
    await fs.writeFile(path.join(shotDir, `${name}.png`), lastImage.toPNG())
  }

  // --- Abrir ---------------------------------------------------------------
  // Un libro que se abre por primera vez ensena su ficha antes de leerse.
  const view = await poll(win, '["sheet", "reader"].includes(document.body.dataset.view) ? document.body.dataset.view : null', 60_000)
  if (!view) {
    console.error('READ: no se llego ni a la ficha ni al lector')
    return 1
  }

  if (view === 'sheet') {
    // El aviso de carga tapa la ficha hasta que el libro acaba de procesarse.
    await poll(win, 'document.getElementById("loading").hidden || null', 60_000)
    await wait(500)
    await shoot('00-ficha')
    const sheet = await js(`
      (() => ({
        title: document.querySelector('.sheet-title')?.textContent ?? '',
        chosen: document.querySelector('.mode-card.is-on .mode-card-name')?.textContent ?? '',
        why: document.querySelector('.sheet-why')?.textContent ?? ''
      }))()
    `)
    console.log(`\nFICHA DEL LIBRO\n  ${sheet.title}\n  elegido: ${sheet.chosen}\n  ${sheet.why.slice(0, 110)}`)
    check(Boolean(sheet.chosen), 'la ficha no trae ningun modo preseleccionado')

    // LECTOR_TASK_MODE fuerza la vista: la ficha preselecciona la sugerida y
    // algunos caminos —las figuras dentro del flujo— solo se ven eligiendo
    // otra a proposito.
    const forced = ['flow', 'sentence', 'page'].indexOf(process.env.LECTOR_TASK_MODE ?? '')
    if (forced !== -1) await js(`document.querySelectorAll('.mode-card')[${forced}].click()`)

    await js(`document.querySelector('.sheet-start').click()`)
    if (!await poll(win, 'document.body.dataset.view === "reader" || null', 40_000)) {
      console.error('READ: el lector no llego a abrirse desde la ficha')
      return 1
    }
  }

  await wait(700)

  // El primer escaneado ofrece reconocer su texto. La tarea lo rechaza para
  // que el recorrido sea deterministico; con LECTOR_TASK_OCR=1 lo acepta y
  // espera al libro reconstruido, que es la prueba completa del OCR.
  if (await js(`Boolean(document.querySelector('dialog.confirm[open]'))`)) {
    if (process.env.LECTOR_TASK_OCR) {
      await js(`document.querySelector('dialog.confirm .btn-danger').click()`)
      const visible = await poll(win, `!document.getElementById('hud-ocr').hidden || null`, 60_000)
      check(visible, 'el aviso de reconocimiento no llego a verse')
      console.log('\nOCR EN MARCHA: esperando a que el libro se reconstruya…')
      const finished = await poll(win, `document.getElementById('hud-ocr').hidden || null`, 600_000)
      check(finished, 'el reconocimiento no termino a tiempo')
      await wait(700)
      const rebuilt = await js(`Number(document.body.dataset.offset) >= 0 && document.body.dataset.view === 'reader'`)
      check(rebuilt, 'el lector no volvio tras aplicar el texto reconocido')
    } else {
      await js(`document.querySelector('dialog.confirm .btn:not(.btn-danger)').click()`)
    }
    await wait(400)
  }

  // El analisis de layout de fondo reconstruye las paradas al terminar; se
  // le espera para que el recorrido no cambie bajo los pies de la tarea. El
  // margen inicial da tiempo a que el aviso llegue a aparecer.
  await wait(4000)
  await poll(win, `document.getElementById('hud-ocr').hidden || null`, 240_000)

  await shoot('01-inicio')

  // --- Avanzar linea a linea ----------------------------------------------
  const wheel = count => js(`
    (() => {
      const stage = document.getElementById('stage')
      for (let i = 0; i < ${count}; i++) {
        stage.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true }))
      }
    })()
  `)

  await wheel(14)
  // La vista de pagina tiene que dibujar la pagina antes de poder medirla.
  await poll(win, `
    (() => {
      if (document.body.dataset.mode !== 'page') return true
      const img = document.querySelector('#content-sharp img')
      return (img && img.complete && img.naturalWidth > 0) || null
    })()
  `, 30_000)
  await wait(500)
  await shoot('02-leyendo')

  const afterWheel = await readState(js)
  const isPageMode = afterWheel.mode === 'page'

  const { a, b, c, d } = afterWheel.mask
  check(a < b && b <= c && c < d, `mascara desordenada: ${a}, ${b}, ${c}, ${d}`)
  check(b >= 0 && c <= afterWheel.stageHeight, 'la banda de foco cae fuera de la pantalla')
  check(afterWheel.offset > 0, 'el punto de lectura no avanzo')

  if (isPageMode) {
    // La pagina se ensena dibujada: lo que hay que comprobar es que llego.
    check(afterWheel.image?.complete && !afterWheel.image.natural.startsWith('0x'),
      `la pagina no se dibujo: ${JSON.stringify(afterWheel.image)}`)
    const { e, f, g, h } = afterWheel.mask
    check(e < f && f <= g && g < h, `el recorte horizontal esta desordenado: ${e}, ${f}, ${g}, ${h}`)
  } else {
    check(afterWheel.contentY < 0, 'el texto no se desplazo al bajar el foco')
    check(afterWheel.sameText, 'las dos capas no tienen el mismo texto')
    check(afterWheel.blocksSharp === afterWheel.blocksDim, 'las capas tienen distinto numero de bloques')

    // Las figuras del capitulo llegan como recortes de la pagina original,
    // asincronos: se les da un momento y despues todas deben estar dibujadas
    // en las dos capas.
    const figures = await js(`
      (() => {
        const count = layer => {
          const imgs = [...document.querySelectorAll('#content-' + layer + ' figure.figure-clip img')]
          return { total: imgs.length, drawn: imgs.filter(i => i.complete && i.naturalWidth > 0).length }
        }
        return { sharp: count('sharp'), dim: count('dim') }
      })()
    `)
    if (figures.sharp.total) {
      console.log(`  figuras: ${figures.sharp.drawn}/${figures.sharp.total} recortes en la capa nitida, ` +
                  `${figures.dim.drawn}/${figures.dim.total} en la atenuada`)
      check(figures.sharp.drawn === figures.sharp.total, 'alguna figura del flujo quedo sin recorte')
      check(figures.dim.drawn === figures.dim.total, 'la capa atenuada no recibio los recortes')
    }
  }

  // --- Cambiar el cuerpo de letra sin perder el sitio ----------------------
  let before = afterWheel.offset

  // Coste de volver a medir: se paga en cada pixel del deslizador de tamano.
  const cost = await js(`
    (async () => {
      const { buildLineIndex } = await import('/src/reader/lineIndex.js')
      const content = document.getElementById('content-sharp')
      let lines = 0
      const t0 = performance.now()
      for (let i = 0; i < 5; i++) lines = buildLineIndex(content).length
      return { ms: (performance.now() - t0) / 5, lines }
    })()
  `)
  console.log(`\nMEDIDA: ${cost.lines} lineas en ${cost.ms.toFixed(1)}ms ` +
              `(${(cost.ms / cost.lines).toFixed(2)}ms por linea)`)

  // Cada vista tiene sus propios ajustes: se mueve el que corresponda.
  const knob = isPageMode ? 'Ampliación' : 'Tamaño'
  const setSlider = value => js(`
    (() => {
      const field = [...document.querySelectorAll('.panel .field')]
        .find(f => f.textContent.includes(${JSON.stringify(knob)}))
      if (!field) throw new Error('no esta el ajuste ${knob}')
      const slider = field.querySelector('input[type=range]')
      slider.value = '${value}'
      slider.dispatchEvent(new Event('input', { bubbles: true }))
    })()
  `)

  await js(`document.getElementById('hud-settings').click()`)
  await wait(300)
  await setSlider(isPageMode ? 1.6 : 28)
  await wait(700)
  await shoot('03-ajustes')

  const afterResize = await readState(js)
  check(afterResize.offset === before,
    `al cambiar el ajuste se perdio el sitio: ${before} -> ${afterResize.offset}`)
  if (!isPageMode) {
    check(afterResize.fontSize === 28, `el cuerpo no se aplico: ${afterResize.fontSize}px`)
  }

  // Dejarlo como estaba y cerrar el panel.
  await setSlider(isPageMode ? 1 : 20)
  await js(`document.getElementById('hud-settings').click()`)
  await wait(400)

  // --- Indice de capitulos ---------------------------------------------------
  // El titulo del HUD despliega la lista con el capitulo actual senalado y
  // Escape la cierra. No se navega desde aqui: cambiaria el punto de lectura
  // del que dependen las comprobaciones de mas abajo.
  const index = await js(`
    (() => {
      const btn = document.getElementById('hud-chapter')
      if (btn.disabled) return { skipped: true }
      btn.click()
      const menu = document.getElementById('chapter-menu')
      return {
        open: !menu.hidden,
        expanded: btn.getAttribute('aria-expanded'),
        items: menu.querySelectorAll('button').length,
        current: menu.querySelector('.is-on')?.textContent ?? null
      }
    })()
  `)
  if (index.skipped) {
    console.log('\nINDICE: un solo capitulo, sin menu')
  } else {
    console.log(`\nINDICE: ${index.items} capitulos, leyendo "${index.current}"`)
    check(index.open && index.expanded === 'true', 'el indice no se abrio desde el HUD')
    check(index.items >= 2, 'el indice no lista los capitulos')
    check(Boolean(index.current), 'el indice no senala el capitulo actual')
    await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
    await wait(200)
    const menuClosed = await js(`document.getElementById('chapter-menu').hidden`)
    check(menuClosed, 'Escape no cerro el indice')
  }

  // --- Frase a frase -------------------------------------------------------
  // Solo aplica al texto re-maquetado: sobre la pagina original la unidad ya es
  // la region entera.
  if (!isPageMode) {
    await js(`
      (() => {
        document.getElementById('hud-settings').click()
        const field = [...document.querySelectorAll('.panel .field')]
          .find(f => f.textContent.includes('Tipo de lectura'))
        const button = [...field.querySelectorAll('button')]
          .find(b => b.textContent.includes('Frase'))
        if (!button) throw new Error('no esta la opcion de frase a frase')
        button.click()
      })()
    `)
    await wait(1200)
    await js(`document.getElementById('hud-settings').click()`)
    await wait(300)

    const wasAt = await readState(js)
    await wheel(1)
    await wait(400)
    const after = await readState(js)
    await shoot('07-frase')

    // Una frase abarca varios renglones, asi que un paso adelanta mas texto que
    // en linea a linea y la banda resaltada es mas alta.
    const band = after.mask.c - after.mask.b
    console.log(`\nFRASE A FRASE\n  banda de ${band.toFixed(0)}px, avance de ${after.offset - wasAt.offset} caracteres`)
    check(after.mode === 'sentence', `no se aplico el modo: ${after.mode}`)
    check(after.offset > wasAt.offset, 'el foco no avanzo de frase')
    check(band > 20, `la banda de la frase es demasiado baja: ${band}px`)

    // Cambiar de unidad recoloca el foco al principio de la frase, asi que de
    // aqui en adelante el punto de referencia es este.
    before = after.offset
  }

  // --- Apagar la guia de lectura -------------------------------------------
  const guideOff = await js(`
    (() => {
      document.getElementById('hud-settings').click()
      const field = [...document.querySelectorAll('.panel .field')]
        .find(f => f.textContent.includes('Guía de lectura'))
      if (!field) throw new Error('no esta el interruptor de guia')
      const off = [...field.querySelectorAll('button')].find(b => b.textContent.includes('Desactivada'))
      off.click()
      const style = getComputedStyle(document.body)
      return {
        blur: style.getPropertyValue('--blur').trim(),
        dim: style.getPropertyValue('--dim').trim(),
        // Con la guia apagada, sus deslizadores no deben seguir ahi.
        sliders: [...document.querySelectorAll('.panel .field')]
          .map(f => f.textContent).filter(t => /Desenfoque|atenuado|Difuminado/.test(t)).length
      }
    })()
  `)
  await wait(400)
  console.log(`\nGUIA APAGADA\n  --blur ${guideOff.blur} · --dim ${guideOff.dim} · deslizadores de foco visibles: ${guideOff.sliders}`)
  check(guideOff.blur === '0px', `el desenfoque no se apago: ${guideOff.blur}`)
  check(guideOff.dim === '1', `el texto sigue atenuado: ${guideOff.dim}`)
  check(guideOff.sliders === 0, 'siguen a la vista deslizadores que ya no hacen nada')

  // Volver a encenderla y cerrar el panel.
  await js(`
    (() => {
      const field = [...document.querySelectorAll('.panel .field')]
        .find(f => f.textContent.includes('Guía de lectura'))
      ;[...field.querySelectorAll('button')].find(b => b.textContent.includes('Activada')).click()
      document.getElementById('hud-settings').click()
    })()
  `)
  await wait(400)

  // --- Marcar la linea actual ---------------------------------------------
  await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', bubbles: true }))`)
  await wait(300)
  await js(`document.getElementById('hud-notes').click()`)
  await wait(500)
  await shoot('04-notas')

  const notes = await js(`
    (() => ({
      count: document.querySelectorAll('.panel .note').length,
      quote: document.querySelector('.panel .note-quote')?.textContent ?? '',
      marked: document.getElementById('hud-bookmark').classList.contains('is-on'),
      // Cualquier bloque puede llevar marcador, tambien una figura.
      bar: document.querySelectorAll('#content-sharp [data-marked]').length
    }))()
  `)
  check(notes.count === 1, `deberia haber una nota, hay ${notes.count}`)
  check(notes.marked, 'el boton de marcar no quedo activo')
  check(isPageMode || notes.bar === 1, 'el parrafo marcado no se senala al margen')

  // --- Volver a la biblioteca y reabrir -----------------------------------
  await js(`document.getElementById('hud-library').click()`)
  await wait(700)
  await shoot('05-biblioteca')

  // El libro que se acaba de leer ocupa la franja de arriba, no la estanteria.
  const library = await js(`
    (() => ({
      view: document.body.dataset.view,
      title: document.querySelector('.resume-title')?.textContent ?? '',
      percent: document.querySelector('.resume-percent')?.textContent ?? '',
      mode: document.querySelector('.resume-meta')?.textContent ?? '',
      action: document.querySelector('.resume-go')?.textContent ?? '',
      // Ancho real pintado de la barra frente al de su carril.
      barRatio: (() => {
        const bar = document.querySelector('.resume-progress .progress-bar > i')
        if (!bar) return null
        return bar.getBoundingClientRect().width / bar.parentElement.getBoundingClientRect().width
      })()
    }))()
  `)
  check(library.view === 'library', 'no se volvio a la biblioteca')
  check(Boolean(library.title), 'la franja de seguir leyendo esta vacia')
  check(/^Seguir/.test(library.action), `el boton no invita a retomar: "${library.action}"`)

  // La barra debe dibujar lo mismo que dice el texto, sea 0% o 90%.
  const shown = Number(library.percent.match(/(\d+)%/)?.[1] ?? -1) / 100
  check(shown >= 0 && library.barRatio !== null && Math.abs(library.barRatio - shown) < 0.02,
    `la barra (${library.barRatio}) no concuerda con el texto (${library.percent})`)

  await js(`document.querySelector('.resume-go').click()`)
  await wait(1500)
  await shoot('06-reabierto')

  const reopened = await readState(js)
  check(reopened.view === 'reader', 'no se reabrio el libro')
  check(reopened.offset === before,
    `no se retomo la lectura donde estaba: ${before} -> ${reopened.offset}`)

  // --- Informe -------------------------------------------------------------
  if (afterWheel.mode === 'page') {
    console.log(`\nVISTA DE PAGINA\n  imagen: ${JSON.stringify(afterWheel.image)}`)
  }

  const prelim = await countPreliminaries(js)

  console.log('\nRECORRIDO COMPLETO')
  if (prelim) {
    console.log(`  antes del cuerpo : ${prelim.stops} paradas desde el principio del documento` +
                ` (arranque automatico en el bloque ${prelim.bodyStart})`)
  }
  console.log(`  tras 14 lineas   : offset ${before}, desplazamiento ${afterWheel.contentY}px`)
  console.log(`  mascara          : a=${a} b=${b} c=${c} d=${d} (pantalla ${afterWheel.stageHeight}px)`)
  console.log(`  cambio de cuerpo : ${afterResize.fontSize}px, offset ${afterResize.offset}`)
  console.log(`  notas            : ${notes.count} · ${notes.quote.slice(0, 70)}…`)
  console.log(`  biblioteca       : "${library.title}" · ${library.percent} · ${library.mode}`)
  console.log(`  al reabrir       : offset ${reopened.offset}`)
  console.log(`  capturas en test/screenshots/`)

  if (problems.length) {
    console.log(`\nPROBLEMAS:\n  - ${problems.join('\n  - ')}`)
    return 1
  }
  console.log('\nREAD OK: sin problemas')
  return 0
}

function readState (js) {
  return js(`
    (() => {
      const layer = document.getElementById('layer-sharp')
      const stage = document.getElementById('stage')
      const style = getComputedStyle(layer)
      const content = document.getElementById('content-sharp')
      const dim = document.getElementById('content-dim')
      const read = name => parseFloat(style.getPropertyValue(name))
      return {
        view: document.body.dataset.view,
        offset: Number(document.body.dataset.offset),
        blocksSharp: content.children.length,
        blocksDim: dim.children.length,
        sameText: content.textContent === dim.textContent,
        fontSize: parseFloat(getComputedStyle(content).fontSize),
        mask: { a: read('--mask-a'), b: read('--mask-b'), c: read('--mask-c'), d: read('--mask-d'), e: read('--mask-e'), f: read('--mask-f'), g: read('--mask-g'), h: read('--mask-h') },
        contentY: parseFloat(getComputedStyle(stage).getPropertyValue('--content-y')),
        stageHeight: stage.clientHeight,
        chapter: document.getElementById('hud-chapter').textContent,
        progress: document.getElementById('hud-progress').textContent,
        mode: document.body.dataset.mode,
        image: (() => {
          const img = content.querySelector('img')
          if (!img) return null
          return {
            complete: img.complete,
            natural: img.naturalWidth + 'x' + img.naturalHeight,
            shown: img.width + 'x' + img.height,
            src: img.src.slice(0, 28)
          }
        })()
      }
    })()
  `)
}

/** Informe de calidad de la extraccion sobre varios PDF reales. */
async function diagnoseTask (win, outRoot) {
  const result = await poll(win, 'window.__diagnose', 300_000)
  if (!result?.ok) {
    console.log(`DIAGNOSE FALLO: ${result?.error ?? 'sin resultado'}`)
    return 1
  }

  for (const r of result.results) {
    console.log(`\n${'='.repeat(74)}`)
    if (r.error) {
      console.log(`${r.file}\n  ERROR: ${r.error}`)
      continue
    }

    // Volcado de una pagina concreta: coordenadas de cada linea.
    if (r.lines) {
      console.log(`Pagina ${r.page} — ${Math.round(r.width)}x${Math.round(r.height)} — canales: ${r.channels?.length ? r.channels.map(Math.round).join(", ") : "ninguno"}`)
      console.log(`${'-'.repeat(74)}`)
      for (const l of r.lines) {
        console.log(`  x${String(l.x).padStart(4)}-${String(l.xEnd).padEnd(4)} y${String(l.y).padStart(4)} ${String(l.size).padStart(5)}pt col${String(l.col).padStart(4)}  ${l.text}`)
      }
      if (r.gaps?.length) {
        console.log(`\n  HUECOS CON CAMBIO DE FUENTE (${r.gaps.length})`)
        for (const g of r.gaps) {
          console.log(`    hueco ${String(g.gap).padStart(5)}  em ${String(g.em).padStart(4)}  ` +
                      `ratio ${(g.gap / g.em).toFixed(3)}   "${g.a}" | "${g.b}"`)
        }
      }
      if (r.drawings?.length) {
        console.log(`\n  DIBUJO DETECTADO (${r.drawings.length} zonas, mayores primero)`)
        for (const d of r.drawings) {
          console.log(`    x${String(d.x).padStart(4)} y${String(d.y).padStart(4)}  ${d.w}x${d.h}`)
        }
      }
      if (r.blocks) {
        console.log(`\n  BLOQUES RESULTANTES (${r.blocks.length})`)
        for (const b of r.blocks) console.log(`    ${b}`)
      }
      continue
    }

    console.log(`${r.file}`)
    console.log(`${'-'.repeat(74)}`)
    console.log(`  titulo    : ${r.title}`)
    console.log(`  autor     : ${r.author || '(sin autor)'}`)
    console.log(`  paginas   : ${r.pageCount}   palabras: ${r.words}   ingesta: ${(r.ms / 1000).toFixed(1)}s`)
    console.log(`  bloques   : ${r.blocks} (${r.headings} titulos, ${r.figures} figuras)   parrafo mediano: ${r.signals.medianLength} car.`)
    console.log(`  caracteres: ${r.chars}   <- si esto se mueve, se mueve el progreso guardado`)
    const st = r.stats
    const marcadas = (st.coverPages ?? 0) + (st.tocPages ?? 0)
    console.log(`  apartadas : ${marcadas} paginas (${st.coverPages ?? 0} cubierta, ${st.tocPages ?? 0} indice)` +
                `   arranque en el bloque ${r.bodyStart} (se saltan ${r.skipped} car.)`)
    console.log(`  estilo    : ${r.style}, cuerpo ${r.bodySize}pt, margenes ${r.stats.bodyLeft}-${r.stats.bodyRight}, interlineado ${r.stats.leading}`)
    console.log(`  capitulos : ${r.chapters} -> ${r.chapterTitles.join(' | ')}`)
    if (r.detected) {
      const d = r.detected
      console.log(`  VISTA     : ${d.mode === 'page' ? 'PÁRRAFO A PÁRRAFO (pagina original)' : 'LINEA A LINEA (re-maquetado)'}` +
                  `  — ${d.why}  [figuras ${(d.figures * 100).toFixed(0)}% de paginas, columnas ${(d.columns * 100).toFixed(0)}%]`)
    }

    const s = r.signals
    console.log(`\n  SENALES`)
    if (s.stops) {
      const t = s.stops
      console.log(`\n  PARADAS DE LA VISTA DE PAGINA (${t.total}, ${t.perPage.toFixed(1)} por pagina)`)
      console.log(`    fuera de la pagina                 : ${t.offPage} (${t.offPagePct.toFixed(1)}%)`)
      console.log(`    cruzan el corredor entre columnas  : ${t.wide} (${t.widePct.toFixed(1)}%)`)
      console.log(`    de 5 caracteres o menos            : ${t.tiny} (${t.tinyPct.toFixed(1)}%)`)
      console.log(`    trozos de ecuacion                 : ${t.formula} (${t.formulaPct.toFixed(1)}%)`)
    }

    console.log(`\n  SENALES DEL TEXTO`)
    console.log(`    parrafos que empiezan en minuscula : ${s.lowerStart} (${s.lowerStartPct.toFixed(1)}%)`)
    console.log(`    parrafos de mas de 2500 caracteres : ${s.veryLong}`)
    console.log(`    parrafos de menos de 25 caracteres : ${s.veryShort}`)
    console.log(`    guiones sin unir al final          : ${s.dangling}`)
    console.log(`    caracteres corruptos               : ${s.corrupt}`)
    console.log(`    textos repetidos 4+ veces          : ${s.repeatedTotal}`)
    for (const rep of s.repeated) console.log(`        ${rep.n}x  "${rep.text}"`)

    for (const [where, lines] of Object.entries(r.samples)) {
      console.log(`\n  ${where.toUpperCase()}`)
      for (const line of lines) console.log(`    ${line}`)
    }
  }

  await fs.mkdir(outRoot, { recursive: true })
  await fs.writeFile(path.join(outRoot, 'diagnose.json'), JSON.stringify(result.results, null, 2))
  return 0
}

/** Dibuja el icono de la aplicacion y lo deja en build/icon.ico. */
async function iconTask (win, projectRoot) {
  const result = await poll(win, 'window.__icon', 15_000)
  if (!result?.ok) {
    console.error(`ICON FALLO: ${result?.error ?? 'sin resultado'}`)
    return 1
  }

  const images = result.images.map(({ size, dataUrl }) => ({
    size,
    png: Buffer.from(dataUrl.split(',')[1], 'base64')
  }))

  const outDir = path.join(projectRoot, 'build')
  await fs.mkdir(outDir, { recursive: true })
  await fs.writeFile(path.join(outDir, 'icon.ico'), buildIco(images))
  // electron-builder tambien acepta un PNG grande para otras plataformas.
  await fs.writeFile(path.join(outDir, 'icon.png'), images[0].png)

  console.log(`ICON OK: build/icon.ico con ${images.map(i => i.size).join(', ')}px`)
  return 0
}

/**
 * Ensambla un .ico con varios PNG dentro: cabecera de 6 bytes, una entrada de
 * 16 por imagen y los datos detras. Windows admite PNG embebido desde Vista.
 */
function buildIco (images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reservado
  header.writeUInt16LE(1, 2) // 1 = icono
  header.writeUInt16LE(images.length, 4)

  const entries = []
  let offset = 6 + images.length * 16

  for (const { size, png } of images) {
    const entry = Buffer.alloc(16)
    // 256 no cabe en un byte y se codifica como 0.
    entry.writeUInt8(size >= 256 ? 0 : size, 0)
    entry.writeUInt8(size >= 256 ? 0 : size, 1)
    entry.writeUInt8(0, 2) // colores de la paleta
    entry.writeUInt8(0, 3) // reservado
    entry.writeUInt16LE(1, 4) // planos
    entry.writeUInt16LE(32, 6) // bits por pixel
    entry.writeUInt32LE(png.length, 8)
    entry.writeUInt32LE(offset, 12)
    entries.push(entry)
    offset += png.length
  }

  return Buffer.concat([header, ...entries, ...images.map(i => i.png)])
}

async function poll (win, expression, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = await win.webContents.executeJavaScript(expression).catch(() => null)
    if (value) return value
    await wait(250)
  }
  return null
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
