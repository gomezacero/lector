// Estadistica de andar por casa, compartida por el resto del pipeline.
// Nada aqui sabe de PDF: son numeros.

export function median (values) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export function percentile (values, p) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]
}

/** Valor mas frecuente, agrupando en cubos para tolerar el ruido decimal. */
export function mode (values, bucket = 1, weights = null) {
  const tally = new Map()
  values.forEach((value, i) => {
    const key = Math.round(value / bucket) * bucket
    tally.set(key, (tally.get(key) ?? 0) + (weights ? weights[i] : 1))
  })
  let best = 0
  let max = -1
  for (const [key, count] of tally) if (count > max) { max = count; best = key }
  return best
}

/**
 * Margen izquierdo de un bloque de texto.
 *
 * No vale la moda: en un libro de parrafos cortos hay tantas lineas sangradas
 * como sin sangrar, y el empate elige la sangria, que es justo la senal que
 * luego hay que detectar. Tampoco vale el minimo: una sola linea que asome mas
 * a la izquierda —la ultima de un parrafo de otra columna, por ejemplo— se
 * llevaria el margen y haria que todas las demas parecieran sangradas.
 *
 * El margen es el menor de los valores con presencia real.
 */
export function marginLeft (values, bucket = 2, minShare = 0.12) {
  if (!values.length) return 0

  const tally = new Map()
  for (const value of values) {
    const key = Math.round(value / bucket) * bucket
    tally.set(key, (tally.get(key) ?? 0) + 1)
  }

  const floor = values.length * minShare
  const frequent = [...tally].filter(([, count]) => count >= floor).map(([key]) => key)
  return frequent.length ? Math.min(...frequent) : percentile(values, 0.1)
}
