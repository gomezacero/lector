// Las paradas de la vista de pagina: en que se detiene el foco y en que orden.
//
// Vive aparte del lector porque es la decision que mas se nota al leer un libro
// tecnico —cuantas veces hay que parar y sobre que— y conviene poder medirla y
// probarla sin arrancar la aplicacion entera.
//
// Regla que no se rompe: agrupar regiones no toca el texto ni los offsets de
// caracter. Cada region conserva el "start" del primer bloque que la compone,
// que es lo que ancla el progreso y las notas.

import { orderBoxes } from '../layout/order.js'

/**
 * Cada region es un bloque en una pagina. Un parrafo que continua en la
 * pagina siguiente da dos regiones: al leerlo hay que pasar de una a otra.
 *
 * Salvo la cubierta y los indices, que dan UNA region por pagina entera. Una
 * cubierta esta hecha para mirarla de una vez, y un indice para buscar en el,
 * no para recorrerlo entrada por entrada: sin esto, el indice de "Fisica
 * Universitaria" son 547 paradas de cuatro caracteres de media.
 *
 * Y salvo las paginas que el modelo de layout ya analizo: ahi las paradas son
 * sus cajas —titulo, parrafo, tabla, figura con su pie— en orden de lectura,
 * que ven la pagina mejor que cualquier heuristica sobre el texto.
 *
 * @param {Object} book
 * @param {{pages:Object}|null} [layouts] detecciones por indice de pagina
 */
export function buildRegions (book, layouts = null) {
  const analyzed = new Map()
  for (const [key, boxes] of Object.entries(layouts?.pages ?? {})) {
    if (Array.isArray(boxes) && boxes.length) analyzed.set(Number(key), boxes)
  }

  const list = []
  const whole = new Set()

  book.blocks.forEach((block, blockIndex) => {
    for (const rect of block.rects ?? []) {
      if (analyzed.has(rect.page)) continue
      const role = book.pageRoles?.[rect.page] ?? block.role
      if (role) {
        if (whole.has(rect.page)) continue
        whole.add(rect.page)
        list.push({ block: blockIndex, type: role, role, rect: fullPage(book, rect.page), start: block.start })
        continue
      }
      list.push({
        block: blockIndex,
        type: block.type,
        rect: insidePage(book, rect),
        start: block.start,
        chars: block.text.trim().length
      })
    }
  })

  list.sort((a, b) => a.block - b.block || a.rect.page - b.rect.page)

  let regions = mergeCrumbs(book, list)
  for (const [page, boxes] of [...analyzed].sort((a, b) => a[0] - b[0])) {
    regions = insertAtPage(regions, layoutRegions(book, page, boxes), page)
  }
  return withLonelyPages(book, regions)
}

// Un bloque pertenece a una caja si esta cae sobre la mayoria de su area.
const LAYOUT_BLOCK_OVERLAP = 0.5

/**
 * Las paradas de una pagina analizada por el modelo: sus cajas en orden de
 * lectura, cada una anclada al primer bloque de texto que cubre. Una caja sin
 * texto debajo —una fotografia— hereda el ancla de la parada anterior, para
 * que los offsets de la lista nunca den saltos sin sentido.
 */
function layoutRegions (book, page, boxes) {
  const onPage = []
  book.blocks.forEach((block, index) => {
    if (block.rects?.some(r => r.page === page)) onPage.push({ block, index })
  })

  const before = lastBlockBefore(book, page)
  let carryStart = book.blocks[before]?.start ?? (book.blocks.length ? 0 : page)
  let carryBlock = Math.max(0, before)

  return orderBoxes(boxes).map(det => {
    const hit = onPage.filter(({ block }) =>
      block.rects.some(r => r.page === page && coveredShare(r, det) >= LAYOUT_BLOCK_OVERLAP))
    const first = hit.sort((a, b) => a.index - b.index)[0]

    if (first) {
      carryStart = first.block.start
      carryBlock = first.index
    }
    return {
      block: carryBlock,
      type: det.label,
      rect: insidePage(book, { page, x: det.x, y: det.y, w: det.w, h: det.h }),
      start: carryStart,
      chars: first?.block.text.trim().length ?? 0
    }
  })
}

/** Que parte del rectangulo del bloque cubre la caja del modelo. */
function coveredShare (rect, det) {
  const w = Math.min(rect.x + rect.w, det.x + det.w) - Math.max(rect.x, det.x)
  const h = Math.min(rect.y + rect.h, det.y + det.h) - Math.max(rect.y, det.y)
  return (Math.max(0, w) * Math.max(0, h)) / (rect.w * rect.h || 1)
}

/** Inserta las regiones de una pagina en su sitio por orden de pagina. */
function insertAtPage (regions, extra, page) {
  if (!extra.length) return regions
  const at = regions.findIndex(r => r.rect.page > page)
  if (at === -1) return [...regions, ...extra]
  return [...regions.slice(0, at), ...extra, ...regions.slice(at)]
}

/**
 * Paradas para las paginas que no dieron ninguna: las escaneadas y las mixtas,
 * que son imagen y no producen bloques. Sin esto un escaneado no tendria donde
 * detenerse y ni siquiera se podria hojear.
 *
 * Cada una entra como pagina entera, en su sitio por orden de pagina, con el
 * offset del ultimo bloque anterior; en un libro sin ningun bloque el offset
 * es el indice de pagina, que es el ancla provisional del pipeline.
 *
 * Las paginas en blanco solo cuentan cuando el libro no tiene bloques: en un
 * libro normal la pagina en blanco entre capitulos se salta, como siempre; en
 * un escaneado se conserva para no descabalar el hojeo pagina a pagina.
 */
function withLonelyPages (book, regions) {
  const kinds = book.pageKinds ?? []
  const pageCount = book.pageCount ?? book.pageSizes?.length ?? 0
  const bare = book.blocks.length === 0

  const covered = new Set(regions.map(r => r.rect.page))
  const out = [...regions]

  for (let page = 0; page < pageCount; page++) {
    if (covered.has(page)) continue
    const kind = kinds[page]
    // 'ocr' sin region es una pagina escaneada donde el reconocimiento no
    // encontro nada (una lamina, una pagina en blanco): se hojea tal cual.
    const lonely = kind === 'scanned' || kind === 'mixed' || kind === 'ocr' || (bare && kind === 'empty')
    if (!lonely) continue

    const before = lastBlockBefore(book, page)
    const region = {
      block: Math.max(0, before),
      type: 'page',
      rect: fullPage(book, page),
      start: bare ? page : (book.blocks[before]?.start ?? 0),
      chars: 0
    }
    const at = out.findIndex(r => r.rect.page > page)
    if (at === -1) out.push(region)
    else out.splice(at, 0, region)
  }
  return out
}

/** Indice del ultimo bloque que empieza en esta pagina o antes, o -1. */
function lastBlockBefore (book, page) {
  let found = -1
  for (const [i, block] of book.blocks.entries()) {
    if (block.page <= page) found = i
    else break
  }
  return found
}

/**
 * Recorta el rectangulo a la pagina.
 *
 * Un ajuste optico o un acento alto dejan coordenadas por encima del borde
 * —en "Fisica Universitaria" hay 77 asi, alguna empezando en y = -21 pt— y el
 * foco se planta sobre el papel en blanco, fuera del texto.
 */
function insidePage (book, rect) {
  const size = book.pageSizes?.[rect.page] ?? { w: 612, h: 792 }
  const x = Math.max(0, rect.x)
  const y = Math.max(0, rect.y)
  return {
    page: rect.page,
    x,
    y,
    w: Math.min(rect.w + (rect.x - x), size.w - x),
    h: Math.min(rect.h + (rect.y - y), size.h - y)
  }
}

// Un bloque corto rara vez se lee solo: es el nivel de una ecuacion, el pie de
// una figura partido o el resto de un parrafo. Por debajo de esto se junta con
// lo que tiene al lado.
const CRUMB_CHARS = 90
// Hasta donde puede crecer una region al juntar migas, en alto de pagina.
const MERGE_MAX_HEIGHT = 0.45

/**
 * Junta en una sola parada los trozos sueltos que se siguen dentro de la misma
 * columna.
 *
 * Una ecuacion desplegada llega partida en un bloque por nivel —numerador,
 * denominador, limite—, y cada uno pedia su propia parada: en "Fisica
 * Universitaria" son 19,8 paradas por pagina, y una de cada cuatro es un trozo
 * que no se puede leer por separado. Juntarlos no cambia el texto ni los
 * offsets, solo deja de detenerse en mitad de una formula.
 */
function mergeCrumbs (book, list) {
  const out = []

  for (const region of list) {
    const prev = out[out.length - 1]
    if (prev && canMerge(book, prev, region)) {
      prev.rect = union(prev.rect, region.rect)
      prev.chars += region.chars
      continue
    }
    out.push(region)
  }
  return out
}

function canMerge (book, prev, next) {
  if (prev.role || next.role) return false
  // Una figura es una unidad de lectura por si misma, no una miga.
  if (prev.type === 'figure' || next.type === 'figure') return false
  if (prev.rect.page !== next.rect.page) return false
  // Si ninguno de los dos es un trozo, son dos parrafos y se leen aparte.
  if (prev.chars > CRUMB_CHARS && next.chars > CRUMB_CHARS) return false

  const size = book.pageSizes?.[next.rect.page] ?? { w: 612, h: 792 }
  const leading = book.stats?.leading || 14

  // Misma columna: los rectangulos tienen que solaparse a lo ancho. Sin esto
  // se juntaria un trozo de la columna izquierda con otro de la derecha.
  const overlap = Math.min(prev.rect.x + prev.rect.w, next.rect.x + next.rect.w) -
                  Math.max(prev.rect.x, next.rect.x)
  if (overlap < Math.min(prev.rect.w, next.rect.w) * 0.5) return false

  // Y estar seguidos: un hueco grande es otra cosa, no la continuacion.
  const gap = next.rect.y - (prev.rect.y + prev.rect.h)
  if (gap > leading * 2.2 || gap < -leading) return false

  const merged = union(prev.rect, next.rect)
  return merged.h <= size.h * MERGE_MAX_HEIGHT
}

function union (a, b) {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return {
    page: a.page,
    x,
    y,
    w: Math.max(a.x + a.w, b.x + b.w) - x,
    h: Math.max(a.y + a.h, b.y + b.h) - y
  }
}

/** El rectangulo de la pagina entera, para lo que se ensena de una pieza. */
function fullPage (book, page) {
  const size = book.pageSizes?.[page] ?? { w: 612, h: 792 }
  return { page, x: 0, y: 0, w: size.w, h: size.h }
}
