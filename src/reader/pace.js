// Ritmo de lectura: caracteres por minuto, medidos sobre la lectura real.
//
// Cada avance del foco es una muestra (cuantos caracteres, cuanto tiempo).
// Solo cuentan las que parecen leer de verdad: ni los saltos por la barra o
// el indice, ni las pausas de irse a por cafe, ni la repeticion de tecla.
// Media movil exponencial: se adapta al lector sin dar bandazos.
//
// Modulo puro: el tiempo entra como argumento, para poder probarlo.

// Por debajo es autorepeat o rueda rapida; por encima fue una pausa.
const MIN_SAMPLE_MS = 800
const MAX_SAMPLE_MS = 60_000

// Un paso mas grande que esto no es leer: es un salto.
const MAX_STEP_CHARS = 2000

const SMOOTHING = 0.1

// Con menos muestras la cifra baila demasiado para ensenarla.
const MIN_SAMPLES = 15

/** @param {number} [initialCpm] velocidad persistida de otras sesiones */
export function createPace (initialCpm = 0) {
  let cpm = initialCpm > 0 ? initialCpm : 0
  let samples = cpm > 0 ? MIN_SAMPLES : 0
  let last = null // { offset, at }

  return {
    /** Un movimiento del punto de lectura, con su momento en ms. */
    record (offset, at) {
      const prev = last
      last = { offset, at }
      if (!prev) return

      const ms = at - prev.at
      const chars = offset - prev.offset
      if (ms < MIN_SAMPLE_MS || ms > MAX_SAMPLE_MS) return
      if (chars <= 0 || chars > MAX_STEP_CHARS) return

      const rate = chars / (ms / 60_000)
      cpm = cpm > 0 ? cpm + (rate - cpm) * SMOOTHING : rate
      samples++
    },

    /** Al cambiar de libro: la primera muestra nueva no debe cruzar libros. */
    reset () { last = null },

    get cpm () { return cpm },
    get ready () { return samples >= MIN_SAMPLES && cpm > 0 },

    /** Minutos estimados para esos caracteres, o null si aun no es fiable. */
    minutesFor (chars) {
      return this.ready ? chars / cpm : null
    }
  }
}
