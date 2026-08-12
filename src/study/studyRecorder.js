const CONDITIONS = new Set(['full', 'line', 'sentence', 'paged'])

export function createStudyRecorder ({ clock = Date } = {}) {
  let session = null

  return {
    start (condition) {
      if (!CONDITIONS.has(condition)) throw new TypeError('condicion de estudio invalida')
      session = { condition, startedAt: clock.now(), regressions: 0 }
    },
    regression () { if (session) session.regressions++ },
    finish (answers = {}) {
      if (!session) throw new Error('no hay estudio en curso')
      const result = {
        ...session,
        durationMs: Math.max(0, clock.now() - session.startedAt),
        ...pickScores(answers)
      }
      session = null
      return result
    },
    cancel () { session = null },
    get active () { return Boolean(session) }
  }
}

function pickScores (answers) {
  const output = {}
  for (const key of ['comprehension', 'fatigue', 'placeLoss', 'preference']) {
    if (Number.isFinite(answers[key])) output[key] = Number(answers[key])
  }
  return output
}

