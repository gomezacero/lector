// Ritmo de lectura perceptible, pero no invasivo.
//
// La velocidad en palabras por minuto es sólo la base. Una unidad con comas,
// punto y coma, cierre de párrafo o un título necesita pausas cognitivas que
// una división cruda por palabras no representa. La guía visual usa esta
// duración; el avance automático es optativo y se suspende al abrir paneles,
// perder el foco o escuchar el libro.

// La lectura de estudio, en otro idioma o con prosa densa puede necesitar un
// ritmo muy inferior a la media conversacional. El control debe acompañar al
// lector, no empujarlo a un mínimo arbitrario.
export const MIN_WPM = 40
export const MAX_WPM = 500

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

export function effectiveWords (text, { heading = false } = {}) {
  const value = String(text ?? '').trim()
  if (!value) return 0
  const words = value.match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu)?.length ?? 0
  const commas = value.match(/[,—–:]/g)?.length ?? 0
  const semicolons = value.match(/[;]/g)?.length ?? 0
  const endings = value.match(/[.!?…]+(?:[”»"']|$)/g)?.length ?? 0
  return words + commas * 0.18 + semicolons * 0.32 + endings * 0.55 + (heading ? 1.4 : 0)
}

/** Duración sugerida para comprender la unidad, no para hacerla desaparecer. */
export function readingDurationMs (text, wpm = 220, options = {}) {
  const speed = clamp(Number(wpm) || 220, MIN_WPM, MAX_WPM)
  const duration = effectiveWords(text, options) / speed * 60_000
  return Math.round(clamp(duration, 900, 60_000))
}

export function createReadingRhythm ({
  clock = globalThis,
  onProgress,
  onAdvance,
  frameMs = 80
} = {}) {
  let mode = 'guided'
  let targetWpm = 220
  let suspended = false
  let paused = false
  let current = null
  let timer = null

  const clear = () => {
    if (timer != null) clock.clearInterval(timer)
    timer = null
  }

  function emit (progress = 0) {
    onProgress?.({
      visible: mode !== 'off' && Boolean(current),
      progress: clamp(progress, 0, 1),
      paused: suspended || paused,
      mode,
      wpm: current?.wpm ?? targetWpm,
      remainingMs: current ? Math.max(0, current.duration - current.elapsed) : 0
    })
  }

  function run () {
    clear()
    if (!current || mode === 'off' || suspended || paused) return emit(current?.elapsed / current?.duration || 0)
    current.startedAt = clock.Date?.now?.() ?? Date.now()
    timer = clock.setInterval(() => {
      const now = clock.Date?.now?.() ?? Date.now()
      current.elapsed += Math.max(0, now - current.startedAt)
      current.startedAt = now
      const progress = current.elapsed / current.duration
      emit(progress)
      if (progress < 1) return
      clear()
      if (mode === 'auto') onAdvance?.()
    }, frameMs)
  }

  function enter ({ key, text, heading = false } = {}, learnedWpm = 0) {
    if (!text || key == null) {
      current = null
      clear()
      return emit(0)
    }
    if (current?.key === key) return
    const wpm = clamp(Number(learnedWpm) || targetWpm, MIN_WPM, MAX_WPM)
    current = {
      key, text, heading, wpm,
      duration: readingDurationMs(text, wpm, { heading }),
      elapsed: 0, startedAt: 0
    }
    emit(0)
    run()
  }

  function configure (next = {}) {
    const previousTarget = targetWpm
    mode = ['off', 'guided', 'auto'].includes(next.mode) ? next.mode : mode
    targetWpm = clamp(Number(next.targetWpm) || targetWpm, MIN_WPM, MAX_WPM)
    // El deslizador debe notarse en la unidad que está en pantalla, no recién
    // después del próximo avance. Se conserva el porcentaje ya transcurrido.
    if (current && targetWpm !== previousTarget) {
      const progress = current.duration ? current.elapsed / current.duration : 0
      current.wpm = targetWpm
      current.duration = readingDurationMs(current.text, targetWpm, { heading: current.heading })
      current.elapsed = current.duration * clamp(progress, 0, 1)
      current.startedAt = clock.Date?.now?.() ?? Date.now()
    }
    if (mode === 'off') clear()
    emit(current?.elapsed / current?.duration || 0)
    if (mode !== 'off' && current && timer == null) run()
  }

  function setSuspended (value) {
    const next = Boolean(value)
    if (next === suspended) return
    if (current && timer != null) {
      const now = clock.Date?.now?.() ?? Date.now()
      current.elapsed += Math.max(0, now - current.startedAt)
    }
    suspended = next
    next ? clear() : run()
    emit(current?.elapsed / current?.duration || 0)
  }

  function togglePause () {
    paused = !paused
    paused ? clear() : run()
    emit(current?.elapsed / current?.duration || 0)
    return paused
  }

  function stop () {
    clear()
    current = null
    paused = false
    emit(0)
  }

  return { enter, configure, setSuspended, togglePause, stop, get paused () { return paused } }
}
