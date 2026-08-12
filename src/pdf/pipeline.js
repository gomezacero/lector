// Orquesta la ingesta: PDF -> Book listo para leer.
// No contiene heuristicas propias; solo encadena los modulos y les da forma.

import { openDocument, closeDocument, extractPage, extractOutline, extractMetadata } from './extract.js'
import { buildLines } from './lines.js'
import { toBlocks } from './blocks.js'
import { buildChapters, splitLongChapters } from './chapters.js'
import { detectSections, detectOpeners, findBodyStart } from './sections.js'
import { classifyPage } from './pageKind.js'
import { refineBookPresentation } from './presentation.js'

// Sube este numero al cambiar el pipeline: invalida los libros ya cacheados.
// v3: corredores de columna medidos en cuerpos de letra, sangria con techo y
// por escalon, y palabras partidas que ya no cortan el parrafo. Sin subirlo,
// los libros abiertos antes seguirian ensenando el texto de la version vieja.
// v4: cubierta e indices marcados. Los bloques y los offsets salen identicos
// —comprobado sobre los seis libros de prueba, bloque a bloque y caracter a
// caracter—, pero el cache viejo no trae ni los roles ni bodyStart.
// v5: pageKinds por pagina y, por bloque, source y confidence cuando no son
// los implicitos (nativo, 1). Desde aqui las subidas ya no tiran el progreso:
// migrate.js transforma el cache viejo o re-ancla tras el reproceso.
// v6: pageKinds clasificados de verdad (texto, escaneo, mixta...). El cache
// v5 los tenia todos en null y clasificar exige el PDF: se reprocesa.
// v7: paginas de referencia marcadas y metricas tipograficas por pagina. Los
// bloques de los preliminares cambian de forma y de texto: se reprocesa, y el
// progreso y las notas se re-anclan por su texto.
// v8: portadillas de capitulo en pageRoles. Los offsets no se mueven, pero
// detectarlas exige las lineas de la pagina: se reprocesa.
// v9: los capitulos desmesurados se parten en tramos (MAX_CHAPTER_BLOCKS).
// Solo cambia la lista de capitulos, que se deriva de si misma: migracion en
// sitio, sin reproceso y sin mover un offset.
// v10: las fechas de un diario ("Sábado 23 de febrero") cuentan como
// capitulos cuando no hay estructura mejor. Migracion en sitio.
// v11: identidad contrastada con la portada, portada/indice fuera del conteo
// de capitulos y bodyEnd para que una novela termine antes de su indice final.
// Todo se deriva del Book v10 sin tocar texto ni offsets: migracion en sitio.
// v12: decodificadores PDF.js configurados, folios OCR eliminados y jerarquia
// de no ficcion reconstruida por partes y numeracion. Los folios cambian los
// offsets, asi que los caches anteriores se reprocesan y se re-anclan.
// v13: el índice impreso corrige acentos y palabras cortadas de los rótulos;
// el comienzo automático salta créditos editoriales anteriores al prefacio.
// v14: esas correcciones se aplican también al texto visible y se recalculan
// offsets antes de guardar; los caches v13 de desarrollo deben reprocesarse.
// v15: preliminares legales, marcadores PDF basura e identidad/encabezado de
// extractos cortos se reconstruyen a partir de la ficha editorial visible.
export const CACHE_VERSION = 15

/**
 * @param {Uint8Array} bytes
 * @param {{fileName?:string, onProgress?:(done:number,total:number)=>void,
 *          ocrItemsByPage?:Object}} options ocrItemsByPage viene del fichero
 *   .ocr.json: items reconocidos por pagina, con el contrato de extractPage
 * @returns {Promise<Object>} Book
 */
export async function buildBook (bytes, { fileName = '', onProgress, ocrItemsByPage } = {}) {
  const doc = await openDocument(bytes)

  try {
    const pages = []
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await extractPage(doc, n, { withDrawings: true })
      let kind = classifyPage(page).kind
      let source = page

      // Una pagina escaneada —o sospechosa: texto extraido pero corrupto—
      // con reconocimiento hecho lee los items del OCR y pasa a ser 'ocr':
      // texto de verdad, solo que de otra procedencia. El resto de la cadena
      // no distingue de donde salieron los items.
      const ocr = ocrItemsByPage?.[n - 1]
      if ((kind === 'scanned' || kind === 'suspect') && ocr?.items?.length) {
        source = { width: page.width, height: page.height, items: ocr.items, drawings: [], images: [] }
        kind = 'ocr'
      }

      pages.push({
        width: page.width,
        height: page.height,
        lines: buildLines(source, n - 1),
        kind
      })
      onProgress?.(n, doc.numPages)
      // Un libro de 400 paginas congelaria la ventana varios segundos: cada
      // pocas paginas se devuelve el hilo para que el aviso de carga se pinte.
      if (n % 8 === 0) await new Promise(resolve => setTimeout(resolve, 0))
    }

    const [outline, meta] = await Promise.all([extractOutline(doc), extractMetadata(doc)])
    const { blocks, metrics, style } = toBlocks(pages)
    const chapters = buildChapters(blocks, outline)

    // Cubierta e indices. Solo se marcan: quitarlos de la lista moveria los
    // offsets de abajo, que son el ancla del progreso y de las notas ya
    // guardadas. Que hacer con ellos lo decide el lector.
    const roles = detectSections(pages, metrics.bodySize)
    if (roles.size) {
      for (const block of blocks) {
        const role = roles.get(block.page)
        if (role) block.role = role
      }
    }

    // Portadillas: la primera pagina de un capitulo compuesta como un poster
    // se ensena de una pieza. Se decide aqui porque hace falta saber donde
    // arrancan los capitulos.
    const openers = detectOpeners(
      pages,
      chapters.map(c => blocks[c.start]?.page).filter(p => !roles.has(p)),
      metrics.bodySize
    )

    // Procedencia: los bloques nacidos del OCR llevan su fuente y confianza,
    // para poder ensenarlo, ordenarlos por calidad o repetir el OCR algun
    // dia. Los nativos no llevan nada: es el valor implicito.
    for (const block of blocks) {
      if (pages[block.page]?.kind !== 'ocr') continue
      block.source = 'ocr'
      block.confidence = ocrItemsByPage[block.page]?.confidence ?? 0
    }

    // Offset de caracter acumulado: es el ancla estable del progreso y de las
    // notas, la unica que sobrevive a un cambio de tipografia.
    let chars = 0
    for (const block of blocks) {
      block.start = chars
      chars += block.text.length + 1
    }

    // Un escaneado puro no tiene ni un bloque, y sin caracteres no habria ni
    // progreso ni paradas. Ancla provisional: cada pagina vale un caracter,
    // offset = indice de pagina. El libro queda marcado como provisional; el
    // dia que un OCR le ponga texto, el progreso se re-ancla por la pagina.
    //
    // Las paginas 'ocr' tambien cuentan: un reconocimiento que solo saco
    // mobiliario (los folios de un album de laminas) deja las paginas en
    // 'ocr' y ningun bloque, y sin esta clausula el libro perderia la marca
    // y quedaria ilegible del todo en vez de seguir hojeandose.
    const provisional = blocks.length === 0 &&
      pages.some(p => p.kind === 'scanned' || p.kind === 'mixed' || p.kind === 'ocr')
    if (provisional) chars = pages.length

    return refineBookPresentation({
      version: CACHE_VERSION,
      title: meta.title || firstHeading(blocks) || cleanFileName(fileName),
      author: meta.author,
      pageCount: doc.numPages,
      // Tamano de cada pagina: sin el no se pueden llevar los rectangulos de
      // los bloques a la pantalla. No todas las paginas miden igual.
      pageSizes: pages.map(p => ({ w: Math.round(p.width), h: Math.round(p.height) })),
      chars,
      blocks,
      // Partidos aqui y no en buildChapters: detectOpeners (arriba) necesita
      // los principios de capitulo de verdad, no los cortes por tamano.
      chapters: splitLongChapters(chapters),
      // El rol tambien por pagina, y no solo en los bloques: una pagina de
      // indice cuyo texto no llega a extraerse —pasa en "El Tunel"— no produce
      // ningun bloque, y la vista de pagina necesita saber igualmente que no
      // es para leerla.
      //
      // Las portadillas SOLO van aqui: en los bloques moverian findBodyStart y
      // la lectura se saltaria el arranque del primer capitulo.
      pageRoles: pages.map((_, i) => roles.get(i) ?? (openers.has(i) ? 'opener' : null)),
      // Que clase de pagina es cada una. De aqui sale si el libro entra como
      // escaneado, que vista le conviene y sobre que paginas correria un OCR.
      pageKinds: pages.map(p => p.kind),
      // Donde empieza el libro de verdad. El lector se posa aqui la primera
      // vez, en vez de en la cubierta.
      bodyStart: findBodyStart(blocks, chars),
      // Solo esta presente —y a true— mientras el libro no tenga texto.
      ...(provisional ? { provisional: true } : {}),
      stats: {
        // Cuantas paginas se han apartado de la lectura, por si un libro sale
        // con el principio saltado sin motivo.
        coverPages: countPages(roles, 'cover'),
        creditPages: countPages(roles, 'credits'),
        tocPages: countPages(roles, 'toc'),
        referencePages: countPages(roles, 'reference'),
        openerPages: openers.size,
        // Cuantas paginas son pura imagen: con mayoria, el libro es un
        // escaneado y se hojea sobre la pagina original. Las ya reconocidas
        // cuentan aparte: tienen texto y no piden ni OCR ni vista de pagina.
        scannedPages: pages.filter(p => p.kind === 'scanned').length,
        ocrPages: pages.filter(p => p.kind === 'ocr').length,
        suspectPages: pages.filter(p => p.kind === 'suspect').length,
        paragraphStyle: style,
        // Con que se decide si el libro se lee re-maquetado o sobre la pagina
        // original: la prosa corriente no trae ni figuras ni columnas.
        figures: blocks.filter(b => b.type === 'figure').length,
        columnPages: pages.filter(p => p.lines.some(l => l.columned)).length,
        bodySize: Math.round(metrics.bodySize * 10) / 10,
        // Las medidas con las que se decide donde empieza cada parrafo. Se
        // guardan porque son lo primero que hay que mirar cuando un libro sale
        // con los parrafos partidos o pegados.
        bodyLeft: Math.round(metrics.bodyLeft),
        bodyRight: Math.round(metrics.bodyRight),
        leading: Math.round(metrics.leading * 10) / 10,
        words: countWords(blocks)
      }
    }, { fileName, version: CACHE_VERSION })
  } finally {
    await closeDocument(doc)
  }
}

const firstHeading = blocks => blocks.find(b => b.type === 'heading')?.text ?? ''

const countPages = (roles, role) =>
  [...roles.values()].filter(r => r === role).length

const countWords = blocks =>
  blocks.reduce((total, b) => total + (b.text.match(/\S+/g)?.length ?? 0), 0)

function cleanFileName (fileName) {
  return fileName
    .replace(/\.pdf$/i, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'Sin título'
}
