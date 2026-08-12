import { describe, it, expect, vi } from 'vitest'
import { createSpeechController, sentenceQueue } from '../src/speech/speechController.js'

const book = {
  blocks: [{ start: 0, page: 0, text: 'Primera frase. Segunda frase.' }],
  chapters: [{ start: 0, end: 1 }]
}

describe('RX-TTS-002 voz anclada a frases', () => {
  it('construye locators y avanza sin duplicarlos', () => {
    expect(sentenceQueue(book).map(item => item.locator.offset)).toEqual([0, 15])
    const utterances = []
    const locations = []
    const port = {
      speak: vi.fn(options => utterances.push(options)),
      pause: vi.fn(), resume: vi.fn(), cancel: vi.fn()
    }
    const speech = createSpeechController({ port, onLocator: locator => locations.push(locator.offset) })
    speech.start(book, { offset: 0 }, { language: 'es', rate: 1 })
    expect(locations).toEqual([0])
    utterances[0].onEnd()
    expect(locations).toEqual([0, 15])
    speech.stop()
    utterances[1].onEnd()
    expect(locations).toEqual([0, 15])
  })

  it('pausa, reanuda y cancela callbacks viejos', () => {
    const port = { speak: vi.fn(), pause: vi.fn(), resume: vi.fn(), cancel: vi.fn() }
    const speech = createSpeechController({ port })
    speech.start(book, { offset: 0 }, {})
    speech.pause(); speech.resume(); speech.stop()
    expect(port.pause).toHaveBeenCalledOnce()
    expect(port.resume).toHaveBeenCalledOnce()
    expect(speech.state).toBe('idle')
  })
})

