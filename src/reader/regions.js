// Las paradas de la vista de pagina: en que se detiene el foco y en que orden.
//
// Vive aparte del lector porque es la decision que mas se nota al leer un libro
// tecnico —cuantas veces hay que parar y sobre que— y conviene poder medirla y
// probarla sin arrancar la aplicacion entera.
//
// Regla que no se rompe: agrupar regiones no toca el texto ni los offsets de
// caracter. Cada region conserva el "start" del primer bloque que la compone,
// que es lo que ancla el progreso y las notas.

/**
 * Cada region es un bloque en una pagina. Un parrafo que continua en la
 * pagina siguiente da dos regiones: al leerlo hay que pasar de una a otra.
 *
 * Salvo la cubierta y los indices, que dan UNA region por pagina entera. Una
 * cubierta esta hecha para mirarla de una vez, y un indice para buscar en el,
 * no para recorrerlo entrada por entrada: sin esto, el indice de "Fisica
 * Universitaria" son 547 paradas de cuatro caracteres de media.
 */
export function buildRegions (book) {
  const list = []
  const whole = new Set()

  book.blocks.forEach((block, blockIndex) => {
    for (const rect of block.rects ?? []) {
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
  return mergeCrumbs(book, list)
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
