import { describe, it, expect, vi } from 'vitest'
import { BUILTIN_SPANISH_VOICE, createOfflineSpeechPort } from '../src/speech/offlineSpeechPort.js'

const fakePort = voices => ({
  voices: () => voices,
  speak: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  cancel: vi.fn()
})

describe('voz espanola incluida', () => {
  it('se anuncia como local y se usa cuando el sistema no tiene espanol', () => {
    const system = fakePort([{ name: 'English', lang: 'en-US', localService: true }])
    const piper = fakePort([BUILTIN_SPANISH_VOICE])
    const port = createOfflineSpeechPort({ system, piper })

    expect(port.voices()).toContain(BUILTIN_SPANISH_VOICE)
    port.speak({ text: 'Hola', language: 'es', voiceName: BUILTIN_SPANISH_VOICE.name })
    expect(piper.speak).toHaveBeenCalledOnce()
    expect(system.speak).not.toHaveBeenCalled()
  })

  it('mantiene una voz espanola del sistema si el lector la elige', () => {
    const system = fakePort([{ name: 'Helena', lang: 'es-ES', localService: true }])
    const piper = fakePort([BUILTIN_SPANISH_VOICE])
    const port = createOfflineSpeechPort({ system, piper })
    port.speak({ text: 'Hola', language: 'es', voiceName: 'Helena' })
    expect(system.speak).toHaveBeenCalledOnce()
  })
})
