import { describe, it, expect } from 'vitest'
import { createStudyRecorder } from '../src/study/studyRecorder.js'

describe('RX-STUDY-002 registro anonimo', () => {
  it('exporta solo condicion, tiempo, regresiones y escalas', () => {
    let now = 100
    const study = createStudyRecorder({ clock: { now: () => now } })
    study.start('paged')
    study.regression(); now = 3100
    expect(study.finish({ comprehension: 0.8, fatigue: 3, name: 'no guardar' })).toEqual({
      condition: 'paged', startedAt: 100, durationMs: 3000, regressions: 1,
      comprehension: 0.8, fatigue: 3
    })
  })
})

