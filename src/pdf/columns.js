// Reparto del texto de una pagina en columnas.
//
// Hace falta por dos motivos distintos, y los dos rompen el libro:
//
//   1. Si dos columnas caen a la misma altura, agruparlas por altura las
//      fusiona en un renglon absurdo:
//        "prefiera un trato un poco el emperador Habsburgo. La estrategia"
//             cita al margen ^^^   ^^^ texto principal
//   2. Aunque no se fusionen (basta con que vayan desfasadas media linea),
//      cada columna tiene su propio margen izquierdo. Medir la sangria de la
//      columna derecha contra el margen del libro la hace parecer sangrada
//      entera, y entonces cada renglon abre parrafo.
//
// Por eso se mide sobre la geometria de la pagina y no sobre los renglones: se
// busca un corredor vertical con poco texto encima. Que este del todo vacio no
// se puede exigir, porque es corrientisimo que la cita ocupe unos renglones y
// luego el texto siga a todo lo ancho cruzandolo.

const MIN_GAP_RATIO = 0.022 // ancho minimo del corredor, respecto a la pagina
const MIN_GAP_EMS = 0.9 // y respecto al cuerpo de letra
// El corredor no tiene por que estar vacio: si la cita ocupa media pagina y
// luego el texto sigue a todo lo ancho, por el pasan bastantes renglones. Se es
// generoso aqui y se filtra despues con isRealChannel, que es mas fiable.
const VALLEY_RATIO = 0.5 // un corredor no pasa de este tanto por uno de texto
const MIN_SIDE_SHARE = 0.12 // texto minimo a cada lado para que sea columna
const MAX_CROSSING = 0.55 // renglones que pueden cruzarlo y seguir siendo canal
const BIN = 1 // en puntos; con menos resolucion se pierden corredores estrechos

/**
 * @param {Array<Array>} rows fragmentos agrupados por renglon
 * @param {number} pageWidth
 * @param {Array} drawings figuras de la pagina; el corredor entre columnas esta
 *   libre de todo, no solo de texto, y una figura llena su columna hasta el
 *   borde mientras que el texto casi nunca llega
 * @returns {number[]} posiciones horizontales de los canales, de izq. a der.
 */
export function findChannels (rows, pageWidth, drawings = []) {
  const items = rows.flat()
  if (items.length < 20) return []

  const bins = new Array(Math.ceil(pageWidth / BIN)).fill(0)
  const cover = (from, to, weight) => {
    const a = Math.max(0, Math.floor(from / BIN))
    const b = Math.min(bins.length - 1, Math.floor(to / BIN))
    for (let i = a; i <= b; i++) bins[i] += weight
  }

  for (const item of items) cover(item.x, item.x + item.w, 1)

  // Una figura pesa tantos renglones como ocupa de alto: si contara como uno
  // solo, el sondeo la ignoraria frente a las decenas de lineas de texto.
  const em = median(items.map(it => it.h)) || 12
  for (const d of drawings) cover(d.x, d.x + d.w, Math.max(1, Math.round(d.h / (em * 1.2))))

  const covered = bins.filter(count => count > 0).sort((a, b) => a - b)
  if (!covered.length) return []
  const typical = covered[covered.length >> 1]
  const valleyMax = Math.floor(typical * VALLEY_RATIO)

  const first = bins.findIndex(count => count > valleyMax)
  const last = findLastIndex(bins, count => count > valleyMax)
  if (first === -1 || last <= first) return []

  const minGap = Math.max(pageWidth * MIN_GAP_RATIO, em * MIN_GAP_EMS)

  // Corredores dentro de la mancha de texto, nunca los margenes de la pagina.
  const channels = []
  let runStart = -1
  for (let i = first; i <= last; i++) {
    const low = bins[i] <= valleyMax
    if (low && runStart === -1) runStart = i
    if (!low && runStart !== -1) {
      if ((i - runStart) * BIN >= minGap) channels.push(centerOfRun(bins, runStart, i))
      runStart = -1
    }
  }

  return channels.filter(x => isRealChannel(x, items, rows, drawings))
}

/**
 * Un corredor solo es una separacion de columnas si hay texto de verdad a los
 * dos lados y si la mayoria de los renglones lo respetan. Asi se descartan el
 * hueco que deja un folio suelto y la coincidencia casual de unos espacios.
 */
function isRealChannel (x, items, rows, drawings = []) {
  const left = items.filter(it => it.x + it.w <= x).length
  const right = items.filter(it => it.x >= x).length
  const share = Math.min(left, right) / items.length
  if (share < MIN_SIDE_SHARE) return false

  // Una figura tumbada sobre el corredor lo invalida igual que el texto.
  if (drawings.some(d => d.x < x - 1 && d.x + d.w > x + 1)) return false

  const crossing = rows.filter(row => row.some(it => it.x < x && it.x + it.w > x)).length
  return crossing / rows.length <= MAX_CROSSING
}

const MIN_BAND = 3 // renglones seguidos para que una banda cuente como columnas

/**
 * Que renglones estan en regimen de columnas.
 *
 * Un canal casi nunca vale para toda la pagina: lo normal es que las columnas
 * ocupen una franja y por debajo el texto siga a todo lo ancho. Si el canal se
 * aplicara igualmente ahi abajo, partiria por la mitad renglones enteros que
 * casualmente tengan un espacio a esa altura.
 *
 * Se toman como columnas las franjas de al menos MIN_BAND renglones seguidos
 * que respetan el canal; los sueltos son texto ancho que se queda entero.
 *
 * @param {Array<Array>} rows renglones ordenados de arriba abajo
 * @returns {boolean[]} un valor por renglon
 */
export function rowsInColumnMode (rows, channels) {
  const crosses = rows.map(row =>
    channels.some(x => row.some(it => it.x < x && it.x + it.w > x)))

  const inMode = new Array(rows.length).fill(false)
  let start = 0
  for (let i = 0; i <= rows.length; i++) {
    if (i < rows.length && !crosses[i]) continue
    if (i - start >= MIN_BAND) inMode.fill(true, start, i)
    start = i + 1
  }
  return inMode
}

/**
 * Reparte los fragmentos de un renglon segun los canales que lo cruzan.
 *
 * Lo que atraviesa un canal de parte a parte va a un flujo propio y no a la
 * primera columna: si se mezclara con ella, el grupo tendria dos margenes
 * izquierdos distintos (el de la cita y el del texto ancho) y esa diferencia
 * se leeria como sangria, partiendo un parrafo en cada renglon.
 *
 * @returns {{columns: Array<Array>, wide: Array}}
 */
export function splitRow (row, channels) {
  const columns = Array.from({ length: channels.length + 1 }, () => [])
  const wide = []

  for (const item of row) {
    const left = item.x
    const right = item.x + item.w

    if (channels.some(channel => left < channel && right > channel)) {
      wide.push(item)
      continue
    }

    let column = 0
    while (column < channels.length && left > channels[column]) column++
    columns[column].push(item)
  }

  return { columns, wide }
}

/**
 * Centro del corredor de verdad dentro de una racha de poca cobertura.
 *
 * La racha suele ser mas ancha que el corredor: por la izquierda incluye la
 * zona donde el texto ya no llega pero la figura si. Tomar el centro de toda la
 * racha lo dejaria caer dentro de la figura, que entonces invalidaria el canal.
 * El corredor es el tramo mas largo con la menor cobertura de la racha.
 */
function centerOfRun (bins, from, to) {
  let lowest = Infinity
  for (let i = from; i < to; i++) lowest = Math.min(lowest, bins[i])

  let best = { start: from, length: 0 }
  let start = -1
  for (let i = from; i <= to; i++) {
    const atFloor = i < to && bins[i] === lowest
    if (atFloor && start === -1) start = i
    if (!atFloor && start !== -1) {
      if (i - start > best.length) best = { start, length: i - start }
      start = -1
    }
  }

  return ((best.start + best.start + best.length) / 2) * BIN
}

function median (values) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[sorted.length >> 1]
}

function findLastIndex (array, predicate) {
  for (let i = array.length - 1; i >= 0; i--) if (predicate(array[i])) return i
  return -1
}
