import { TtsSession } from '../../vendor/tts/runtime/piper-tts-web.js'
import { createWebSpeechPort } from './speechController.js'

export const BUILTIN_SPANISH_VOICE = Object.freeze({
  name: 'Lector — Español offline',
  lang: 'es-ES',
  localService: true,
  default: false,
  engine: 'piper'
})

const VOICE_ID = 'es_ES-davefx-medium'
const WASM_PATHS = {
  onnxWasm: '/node_modules/onnxruntime-web/dist/',
  piperData: '/node_modules/@diffusionstudio/piper-wasm/build/piper_phonemize.data',
  piperWasm: '/node_modules/@diffusionstudio/piper-wasm/build/piper_phonemize.wasm'
}

/** Motor neuronal espanol incluido. Todo lo que carga vive bajo app://. */
export function createPiperSpeechPort ({
  Session = TtsSession,
  AudioClass = globalThis.Audio,
  URLApi = globalThis.URL
} = {}) {
  let sessionPromise = null
  let audio = null
  let objectUrl = null
  let generation = 0
  let paused = false

  const session = () => (sessionPromise ??= Session.create({
    voiceId: VOICE_ID,
    wasmPaths: WASM_PATHS
  }))

  const releaseAudio = () => {
    if (audio) {
      audio.onended = null
      audio.onerror = null
      audio.pause?.()
    }
    audio = null
    if (objectUrl) URLApi?.revokeObjectURL?.(objectUrl)
    objectUrl = null
  }

  return {
    voices: () => [BUILTIN_SPANISH_VOICE],
    speak ({ text, rate = 1, onEnd, onError }) {
      const own = ++generation
      paused = false
      releaseAudio()

      void session().then(engine => engine.predict(text)).then(blob => {
        if (own !== generation) return
        if (!AudioClass || !URLApi?.createObjectURL) throw new Error('salida de audio no disponible')
        objectUrl = URLApi.createObjectURL(blob)
        audio = new AudioClass(objectUrl)
        audio.playbackRate = Math.max(0.7, Math.min(2, Number(rate) || 1))
        audio.onended = () => {
          if (own !== generation) return
          releaseAudio()
          onEnd?.()
        }
        audio.onerror = () => {
          if (own !== generation) return
          releaseAudio()
          onError?.(new Error('no se pudo reproducir la voz local'))
        }
        if (!paused) return audio.play()
      }).catch(error => {
        if (own === generation) onError?.(error instanceof Error ? error : new Error(String(error)))
      })
    },
    pause () {
      paused = true
      audio?.pause?.()
    },
    resume () {
      paused = false
      if (audio?.paused) void audio.play().catch(() => {})
    },
    cancel () {
      generation++
      paused = false
      releaseAudio()
    }
  }
}

/**
 * Prefiere las voces del sistema cuando existen y aporta una voz espanola
 * empaquetada cuando Windows, macOS o Linux no tienen una instalada.
 */
export function createOfflineSpeechPort ({
  system = createWebSpeechPort(),
  piper = createPiperSpeechPort()
} = {}) {
  let active = null
  const systemSpanish = () => system.voices().filter(voice => voice.lang?.toLowerCase().startsWith('es'))

  return {
    voices: () => [...system.voices(), ...piper.voices()],
    speak (options) {
      const usePiper = options.voiceName === BUILTIN_SPANISH_VOICE.name ||
        (options.language?.toLowerCase().startsWith('es') && !systemSpanish().length)
      active = usePiper ? piper : system
      active.speak(options)
    },
    pause: () => active?.pause(),
    resume: () => active?.resume(),
    cancel () {
      system.cancel()
      piper.cancel()
      active = null
    }
  }
}
