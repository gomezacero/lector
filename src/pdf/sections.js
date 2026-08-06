// Que paginas de un libro no son para leerlas: la cubierta y los indices.
//
// No se borra nada. Se marca, y ya decide el lector que hacer con cada cosa:
// una cubierta se ensena entera porque esta hecha para mirarse, y un indice se
// pliega porque sirve para navegar, no para recorrerlo entrada por entrada.
// Borrar bloques moveria los offsets de caracter, que son el ancla del progreso
// y de las notas de los libros ya empezados.
//
// Todas las reglas son de pagina entera, nunca de bloque suelto: un renglon
// corto aparece en cualquier sitio, pero una pagina llena de renglones cortos
// que acaban en numero solo es un indice.

/**
 * "Capitulo 3 .......... 42": los puntos guia de una entrada de indice.
 *
 * El numero de pagina es opcional a proposito. En "El Tunel" las entradas del
 * indice acaban en puntos y el numero no llega a extraerse; la fila de puntos
 * sola ya es senal de sobra, y cuatro seguidos no salen en prosa ni siquiera
 * con puntos suspensivos.
 */
const GUIDE_DOTS = /[.·]\s?(?:[.·]\s?){3,}\d{0,4}\s*$/

/** Sin puntos guia, una entrada sigue acabando en su numero de pagina. */
const ENDS_IN_NUMBER = /(?:^|\s)\d{1,4}$/

const TOC_TITLE = /^(índice|indice|contenido|contents|index|sumario|table of contents)\b/i

// Un indice ocupa paginas seguidas, pero cuatro son ya muchas para fiarse solo
// de que los renglones sean cortos: los resumenes de capitulo tambien lo son.
const MAX_CONTINUATION = 4

// Si el marcado se dispara sobre un cuarto del libro es que algo va mal, y es
// preferible no marcar nada a plegarle al lector medio libro.
const MAX_MARKED_SHARE = 0.25

const CONTINUATION_CHARS = 30
const COVER_MAX_LINES = 8
// Una cubierta lleva rotulos —titulo, autor, editorial—, no frases. Sin esto,
// un documento que arranca con un parrafo corto pasaria por cubierta.
const COVER_MAX_AVERAGE = 60
const MIN_PAGES_FOR_COVER = 10

/**
 * @param {Array<{lines:Array}>} pages paginas con sus lineas ya construidas
 * @param {number} [bodySize] cuerpo de letra del libro, para juzgar los titulos
 * @returns {Map<number, 'cover'|'toc'>} rol por indice de pagina
 */
export function detectSections (pages, bodySize = 0) {
  const roles = new Map()
  if (!pages.length) return roles

  const textOf = page => page.lines.filter(l => !l.figure && l.text)

  markCover(pages, textOf, roles)
  markIndexes(pages, textOf, roles, bodySize)

  // La salvaguarda es sobre el total: cada regla por separado puede ser
  // razonable y el conjunto seguir siendo demasiado.
  if (roles.size > pages.length * MAX_MARKED_SHARE) return new Map()
  return roles
}

/**
 * La cubierta es la primera pagina con algo escrito, y ninguna mas.
 *
 * La tentacion es marcar toda pagina de pocos renglones dentro de las primeras,
 * pero eso se lleva por delante lo que si es del autor: la dedicatoria de
 * "Cien anos de soledad", el epigrafe en verso de "La tregua", la dedicatoria
 * firmada de Sabato. Todas caben en cinco renglones y todas se leen.
 */
function markCover (pages, textOf, roles) {
  if (pages.length < MIN_PAGES_FOR_COVER) return

  const first = pages.findIndex(page => textOf(page).length || page.lines.length)
  if (first === -1) return

  // Un articulo que arranca con el titulo y el resumen en la primera pagina no
  // tiene cubierta que ensenar.
  const lines = textOf(pages[first])
  if (lines.length > COVER_MAX_LINES) return
  if (lines.length && averageLength(lines) > COVER_MAX_AVERAGE) return
  roles.set(first, 'cover')
}

/**
 * Indices, tanto el general del principio como el alfabetico del final.
 *
 * No se distinguen: los dos son listas para buscar algo, no para leerlas, y
 * llevan el mismo trato. Donde importa donde caen —el porcentaje de lectura—
 * se mira la posicion en ese momento, que es mas fiable que un nombre puesto
 * aqui a partir de un titulo que en muchos libros es "Indice" a secas.
 */
function markIndexes (pages, textOf, roles, bodySize) {
  for (let i = 0; i < pages.length; i++) {
    if (roles.has(i)) continue
    const lines = textOf(pages[i])
    if (!lines.length) continue

    if (!hasIndexTitle(lines, bodySize) && !looksLikeIndex(lines)) continue
    roles.set(i, 'toc')

    // Un indice no cabe en una pagina. Las siguientes se aceptan por tener los
    // renglones cortos, con tope: sin el, los resumenes de capitulo de un libro
    // de fisica —igual de cortos— se plegarian tambien.
    let seguidas = 0
    for (let j = i + 1; j < pages.length && seguidas < MAX_CONTINUATION; j++) {
      const next = textOf(pages[j])
      // Una pagina en blanco a mitad de indice no lo corta.
      if (next.length && !looksLikeIndex(next) && averageLength(next) > CONTINUATION_CHARS) break
      roles.set(j, 'toc')
      seguidas++
      i = j
    }
  }
}

/**
 * "Indice", "Contenido", "Contents" en cabeza y en cuerpo mayor que el texto.
 *
 * El cuerpo con el que se compara es el del libro y no el de la pagina: en un
 * indice bien maquetado el titulo suele estar solo en su pagina, y medido
 * contra si mismo nunca seria mayor que el cuerpo.
 */
function hasIndexTitle (lines, bodySize) {
  // Un titulo solo en su pagina no tiene con que compararse: ahi basta con que
  // lo diga, porque no hay texto alrededor que pudiera confundirse.
  const alone = lines.length <= 2
  const body = bodySize || (alone ? 0 : medianSize(lines))

  return lines.slice(0, 3).some(line =>
    TOC_TITLE.test(line.text.trim()) &&
    line.text.trim().length <= 44 &&
    (!body || line.fontSize >= body * 1.1))
}

/**
 * Dos senales, cada una suficiente. Se midieron sobre seis libros reales sin un
 * solo falso positivo en 1.858 paginas de texto corrido.
 */
function looksLikeIndex (lines) {
  const dotted = lines.filter(l => GUIDE_DOTS.test(l.text)).length
  if (dotted >= 3 && dotted >= lines.length * 0.3) return true

  // Bajar del 60 % empieza a confundir las paginas de figuras rotuladas, donde
  // muchos pies acaban en un numero ("3x3 conv, 64").
  const numbered = lines.filter(l => ENDS_IN_NUMBER.test(l.text)).length
  return lines.length >= 8 && numbered >= lines.length * 0.6
}

const averageLength = lines =>
  lines.reduce((total, l) => total + l.text.length, 0) / lines.length

function medianSize (lines) {
  const sizes = lines.map(l => l.fontSize).filter(Boolean).sort((a, b) => a - b)
  return sizes.length ? sizes[Math.floor(sizes.length / 2)] : 0
}

// Los preliminares de un libro son unas pocas decenas de paginas incluso en un
// manual gordo. En numero absoluto y no en porcentaje: hay documentos que son
// extractos de sesenta paginas cuyo indice ocupa el primer quinto del fichero.
const PRELIM_PAGES = 40

/**
 * Donde empieza el libro de verdad: justo detras de la ultima cubierta o indice
 * de los preliminares.
 *
 * Se busca el ULTIMO y no el primero porque entre medias hay prosa legitima
 * —el prefacio, "al estudiante", los agradecimientos— y parar en ella dejaria
 * al lector delante del indice otra vez. Nada se pierde: lo saltado sigue ahi,
 * a un gesto, y en el indice de capitulos.
 *
 * @returns {number} indice del bloque, 0 si no hay nada que saltar
 */
export function findBodyStart (blocks, totalChars) {
  let last = -1
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].page >= PRELIM_PAGES) break
    if (blocks[i].role) last = i
  }
  if (last === -1) return 0

  const start = last + 1
  if (start >= blocks.length) return 0

  // Tope duro. Si el marcado se equivoca, el lector se pierde el principio del
  // libro sin saber por que; que salte poco o nada es un fallo mucho mas barato.
  const skipped = blocks[start].start ?? 0
  if (totalChars && skipped > totalChars * 0.2) return 0
  return start
}
