import { describe, it, expect } from 'vitest'
import { promises as fs } from 'node:fs'

describe('promesa offline', () => {
  it('la CSP niega la red y los motores apuntan a recursos locales', async () => {
    const [html, ocr, layout, dictionary, speech] = await Promise.all([
      fs.readFile('src/index.html', 'utf8'),
      fs.readFile('src/ocr/engine.js', 'utf8'),
      fs.readFile('src/layout/layoutRun.js', 'utf8'),
      fs.readFile('src/dictionary/dictionaryProvider.js', 'utf8'),
      fs.readFile('src/speech/speechController.js', 'utf8')
    ])

    expect(html).toContain("default-src 'none'")
    expect(html).toContain("connect-src 'self' blob:")
    expect(ocr).not.toMatch(/https?:\/\//)
    expect(layout).not.toMatch(/https?:\/\//)
    expect(dictionary).not.toMatch(/https?:\/\//)
    expect(speech).not.toMatch(/https?:\/\//)
    expect(ocr).toContain("langPath: '/vendor/tesseract'")
    expect(layout).toContain("'/vendor/layout/")
    expect(dictionary).toContain("baseUrl = '/src/dictionary/data'")
    expect(speech).toContain('localService === true')
  })
})
