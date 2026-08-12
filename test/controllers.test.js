import { describe, it, expect, vi, afterEach } from 'vitest'
import { createBackgroundTaskCoordinator } from '../src/app/backgroundTaskCoordinator.js'
import { createBookSessionController } from '../src/app/bookSessionController.js'

afterEach(() => vi.useRealTimers())

describe('BackgroundTaskCoordinator', () => {
  it('cancela trabajos y descarta callbacks de una sesion anterior', async () => {
    const tasks = createBackgroundTaskCoordinator()
    const first = tasks.beginSession('libro-a')
    const callback = vi.fn()
    const guarded = tasks.guard(first, callback)
    const cancel = vi.fn()

    await tasks.start('ocr', { start: () => {}, cancel }, first)
    tasks.beginSession('libro-b')
    guarded('tarde')

    expect(callback).not.toHaveBeenCalled()
    // El trabajo ya habia terminado; comenzar otra sesion no cancela algo
    // inexistente, pero el token sigue protegiendo su callback tardio.
    expect(cancel).not.toHaveBeenCalled()
  })

  it('cancela un trabajo que sigue activo al cambiar de libro', () => {
    const tasks = createBackgroundTaskCoordinator()
    const token = tasks.beginSession('libro-a')
    const cancel = vi.fn()
    tasks.start('ocr', { start: () => new Promise(() => {}), cancel }, token)
    return Promise.resolve().then(() => {
      tasks.beginSession('libro-b')
      expect(cancel).toHaveBeenCalledOnce()
    })
  })
})

describe('BookSessionController', () => {
  it('flush guarda ajustes aunque el temporizador no haya vencido', async () => {
    vi.useFakeTimers()
    const library = { saveProgress: vi.fn(), updateReading: vi.fn() }
    const session = createBookSessionController({ library })
    session.open({ id: 'a'.repeat(32), path: 'a.pdf', title: 'A', pageCount: 1 }, {
      book: { bodyStart: 7 }, bytes: new Uint8Array()
    })

    session.scheduleReading({ fontSize: 26, readingMode: 'flow' })
    expect(library.updateReading).not.toHaveBeenCalled()
    await session.flush()

    expect(library.updateReading).toHaveBeenCalledWith(
      'a'.repeat(32), { fontSize: 26, readingMode: 'flow' }, 'flow')
  })

  it('centraliza el progreso y espera su escritura', async () => {
    let release
    const saved = new Promise(resolve => { release = resolve })
    const library = { saveProgress: vi.fn(() => saved), updateReading: vi.fn() }
    const session = createBookSessionController({ library })
    session.open({ id: 'b'.repeat(32), path: 'b.pdf', title: 'B', pageCount: 1 }, {
      book: { bodyStart: 0 }, bytes: new Uint8Array()
    })
    session.saveProgress({ offset: 30, percent: 0.3, chapter: 1 })

    let flushed = false
    const flushing = session.flush().then(() => { flushed = true })
    await Promise.resolve()
    expect(flushed).toBe(false)
    release()
    await flushing
    expect(session.offset).toBe(30)
  })

  it('RX-SRCH-003 conserva una pila LIFO limitada y la limpia al cambiar de libro', () => {
    const library = { saveProgress: vi.fn(), updateReading: vi.fn() }
    const session = createBookSessionController({ library })
    const document = { book: { bodyStart: 0 }, bytes: new Uint8Array() }
    session.open({ id: 'c'.repeat(32) }, document)
    for (let i = 0; i < 25; i++) session.rememberReturnPoint({ offset: i }, 'search')
    expect(session.returnDepth).toBe(20)
    expect(session.takeReturnPoint()).toEqual({ offset: 24 })
    session.open({ id: 'd'.repeat(32) }, document)
    expect(session.canReturn).toBe(false)
  })
})
