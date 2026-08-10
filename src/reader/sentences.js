// Division del texto en frases.
//
// El renglon es una unidad del maquetador: donde acaba no significa nada. La
// frase es una unidad de sentido, y avanzar por frases se acerca mucho mas a
// como se lee de verdad, sobre todo en texto denso.
//
// Modulo puro: entra una cadena, salen tramos.

// Abreviaturas que siempre anteceden a algo —un nombre, un numero— y por tanto
// nunca cierran la frase. "etc." no esta aqui a proposito: cuando le sigue
// mayuscula si termina la frase, que es justo lo que la regla general detecta.
const ABBREVIATIONS = new Set([
  'sr.', 'sra.', 'srta.', 'dr.', 'dra.', 'prof.', 'lic.', 'ing.', 'ud.', 'uds.',
  'ej.', 'p.', 'pp.', 'pag.', 'pág.', 'cap.', 'vol.', 'núm.', 'num.',
  'art.', 'fig.', 'ss.', 'aa.', 'ee.', 'uu.', 'av.', 'avda.', 'c.', 'a.', 'd.',
  'jr.', 'st.', 'vs.', 'op.', 'cit.', 'ed.', 'trad.', 'apdo.', 'depto.'
])

// Un cierre puede venir seguido de comillas o parentesis, y esos signos son
// parte de la frase que termina, no de la siguiente.
const CLOSERS = '»"\'”’)]'
const ENDINGS = '.!?…'

/**
 * @param {string} text
 * @returns {Array<{start:number, end:number}>} tramos sobre el texto original
 */
export function splitSentences (text) {
  if (!text?.trim()) return []

  const sentences = []
  let start = 0

  for (let i = 0; i < text.length; i++) {
    if (!ENDINGS.includes(text[i])) continue

    // Arrastrar los signos de cierre que van pegados al final.
    let end = i + 1
    while (end < text.length && CLOSERS.includes(text[end])) end++

    if (!closesSentence(text, i, end)) continue

    push(sentences, text, start, end)
    start = end
  }

  push(sentences, text, start, text.length)
  return sentences
}

/** Decide si un signo de puntuacion termina de verdad la frase. */
function closesSentence (text, at, end) {
  // Sin nada detras, cierra: es el final del texto.
  const rest = text.slice(end)
  if (!rest.trim()) return true

  // Tiene que haber un espacio; "1.75" o "art.5" no son dos frases.
  if (!/^\s/.test(rest)) return false

  // Y lo siguiente ha de poder abrir frase: mayuscula, apertura, numero o raya.
  if (!/^\s+[«"'¿¡(—-]?[A-ZÁÉÍÓÚÜÑ0-9]/.test(rest)) return false

  if (text[at] !== '.') return true

  // Un punto detras de una abreviatura o de una inicial no cierra nada.
  const word = text.slice(0, at + 1).split(/\s+/).pop().toLowerCase()
  if (ABBREVIATIONS.has(word)) return false
  return !/^[a-záéíóúüñ]\.$/i.test(word)
}

function push (sentences, text, start, end) {
  const raw = text.slice(start, end)
  const trimmed = raw.trim()
  if (!trimmed) return

  const offset = raw.indexOf(trimmed)
  sentences.push({ start: start + offset, end: start + offset + trimmed.length })
}

/**
 * Agrupa las lineas ya medidas en unidades de una frase.
 *
 * Una unidad abarca todos los renglones que toca la frase, enteros. Recortarlos
 * a mitad de renglon seria mas fiel, pero cansa la vista y el valor esta en
 * avanzar por sentido, no en el recorte.
 *
 * @param {Array} lines lineas visuales del capitulo, en orden de lectura
 * @param {Array} blocks bloques del libro
 * @returns {Array} unidades con la misma forma que una linea
 */
export function toSentenceUnits (lines, blocks) {
  const units = []

  // Se recorren las frases y no los renglones. Una frase que empieza a mitad de
  // renglon comparte ese renglon con la anterior, asi que las unidades se
  // solapan; asignar cada renglon a una sola frase dejaria fuera justo el
  // renglon en el que la frase empieza.
  for (const [blockIndex, own] of linesByBlock(lines)) {
    const block = blocks[blockIndex]
    if (!block?.text) {
      units.push(...own)
      continue
    }

    for (const sentence of sentencesOf(block)) {
      const touched = own.filter(line => line.start < sentence.end && line.end > sentence.start)
      if (!touched.length) continue

      const top = Math.min(...touched.map(l => l.top))
      const bottom = Math.max(...touched.map(l => l.bottom))

      // Dos frases cortas que caben en los mismos renglones se leen de un
      // vistazo: pararse dos veces sobre la misma banda es un tartamudeo, no
      // una guia. Se alarga la parada anterior en vez de abrir otra igual.
      const prev = units.at(-1)
      if (prev && prev.block === blockIndex && prev.top === top && prev.bottom === bottom) {
        prev.end = sentence.end
        continue
      }

      units.push({ ...touched[0], top, bottom, start: sentence.start, end: sentence.end })
    }
  }

  return units
}

/**
 * Lineas de cada bloque, en el orden en que aparecen. Una sola pasada: filtrar
 * todas las lineas una vez por bloque era cuadratico, y en un capitulo de mil
 * y pico bloques se notaba en cada re-maquetado.
 */
function linesByBlock (lines) {
  const byBlock = new Map()
  for (const line of lines) {
    const own = byBlock.get(line.block)
    if (own) own.push(line)
    else byBlock.set(line.block, [line])
  }
  return byBlock
}

// Las frases de un bloque no cambian: se calculan una vez por libro abierto.
const cache = new WeakMap()

function sentencesOf (block) {
  let found = cache.get(block)
  if (!found) {
    found = splitSentences(block.text)
    cache.set(block, found)
  }
  return found
}
