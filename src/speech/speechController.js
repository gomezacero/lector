import { splitSentences } from '../reader/sentences.js'
import { chapterAtOffset } from '../reader/progress.js'

export function sentenceQueue (book) {
  const queue = []
  for (const block of book?.blocks ?? []) {
    if (!block?.text) continue
    for (const sentence of splitSentences(block.text)) {
      const offset = block.start + sentence.start
      queue.push({
        text: block.text.slice(sentence.start, sentence.end),
        locator: { offset, context: block.text.slice(sentence.start, sentence.start + 200), page: block.page },
        chapter: chapterAtOffset(book, offset)
      })
    }
  }
  return queue
}

export function createWebSpeechPort (synthesis = globalThis.speechSynthesis) {
  return {
    voices: () => (synthesis?.getVoices?.() ?? []).filter(voice => voice.localService === true),
    speak ({ text, rate, voiceName, language, onEnd, onError }) {
      if (!synthesis || typeof SpeechSynthesisUtterance === 'undefined') throw new Error('voz no disponible')
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = rate
      utterance.lang = language
      utterance.voice = this.voices().find(voice => voice.name === voiceName) ??
        this.voices().find(voice => voice.lang?.toLowerCase().startsWith(language)) ?? null
      if (!utterance.voice) throw new Error('no hay una voz local para este idioma')
      utterance.onend = onEnd
      utterance.onerror = event => onError?.(new Error(event.error ?? 'fallo de voz'))
      synthesis.speak(utterance)
    },
    pause: () => synthesis?.pause?.(),
    resume: () => synthesis?.resume?.(),
    cancel: () => synthesis?.cancel?.()
  }
}

export function createSpeechController ({ port, onLocator, onState, clock = globalThis }) {
  let queue = []
  let index = 0
  let state = 'idle'
  let generation = 0
  let preferences = {}
  let timer = null
  let startChapter = null

  const emit = error => onState?.({ state, index, total: queue.length, error })

  function locate (offset) {
    let found = 0
    for (let i = 0; i < queue.length; i++) {
      if (queue[i].locator.offset > offset) break
      found = i
    }
    return found
  }

  function speakCurrent () {
    const item = queue[index]
    if (!item) return stop()
    if (preferences.sleepTimer === 'chapter' && startChapter != null && item.chapter !== startChapter) return stop()
    const own = generation
    state = 'speaking'
    onLocator?.(item.locator)
    emit()
    try {
      port.speak({
        text: item.text,
        rate: preferences.rate ?? 1,
        voiceName: preferences.voice,
        language: preferences.language ?? 'es',
        onEnd: () => {
          if (own !== generation || state === 'idle') return
          index++
          speakCurrent()
        },
        onError: error => {
          if (own !== generation) return
          state = 'paused'
          emit(error)
        }
      })
    } catch (error) {
      state = 'paused'
      emit(error)
    }
  }

  function start (book, locator, nextPreferences = {}) {
    stop()
    queue = sentenceQueue(book)
    preferences = nextPreferences
    index = locate(locator?.offset ?? 0)
    startChapter = queue[index]?.chapter ?? null
    generation++
    const minutes = Number(preferences.sleepTimer)
    if (Number.isFinite(minutes) && minutes > 0) {
      timer = clock.setTimeout(stop, minutes * 60_000)
    }
    speakCurrent()
  }

  function pause () {
    if (state !== 'speaking') return
    port.pause()
    state = 'paused'
    emit()
  }

  function resume () {
    if (state !== 'paused') return
    port.resume()
    state = 'speaking'
    emit()
  }

  function step (delta) {
    if (!queue.length) return
    port.cancel()
    generation++
    index = Math.max(0, Math.min(queue.length - 1, index + delta))
    speakCurrent()
  }

  function stop () {
    generation++
    if (timer) clock.clearTimeout(timer)
    timer = null
    port.cancel()
    state = 'idle'
    emit()
  }

  return {
    start, pause, resume, stop,
    previous: () => step(-1),
    next: () => step(1),
    get state () { return state },
    get isActive () { return state !== 'idle' }
  }
}

