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
  if (task === 'icon') return 'app://lector/src/dev/icon.html'
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
  diagnose: diagnoseTask,
  read: readTask,
  home: homeTask,
  icon: iconTask,
  smoke: smokeTask
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

  return state.view === 'library' ? 0 : 1
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

    await js(`document.querySelector('.sheet-start').click()`)
    if (!await poll(win, 'document.body.dataset.view === "reader" || null', 40_000)) {
      console.error('READ: el lector no llego a abrirse desde la ficha')
      return 1
    }
  }

  await wait(700)
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
  }

  // --- Cambiar el cuerpo de letra sin perder el sitio ----------------------
  const before = afterWheel.offset

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
      bar: document.querySelectorAll('#content-sharp p[data-marked]').length
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

  console.log('\nRECORRIDO COMPLETO')
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
    console.log(`  estilo    : ${r.style}, cuerpo ${r.bodySize}pt, margenes ${r.stats.bodyLeft}-${r.stats.bodyRight}, interlineado ${r.stats.leading}`)
    console.log(`  capitulos : ${r.chapters} -> ${r.chapterTitles.join(' | ')}`)
    if (r.detected) {
      const d = r.detected
      console.log(`  VISTA     : ${d.mode === 'page' ? 'PÁRRAFO A PÁRRAFO (pagina original)' : 'LINEA A LINEA (re-maquetado)'}` +
                  `  — ${d.why}  [figuras ${(d.figures * 100).toFixed(0)}% de paginas, columnas ${(d.columns * 100).toFixed(0)}%]`)
    }

    const s = r.signals
    console.log(`\n  SENALES`)
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
