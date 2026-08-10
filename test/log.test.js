// El log persistente de errores, probado en Node con un userData temporal.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

vi.mock('electron', () => ({
  app: { getPath: () => process.env.LECTOR_TEST_USERDATA }
}))

import { logLine, LOG_LIMIT } from '../electron/log.js'

let base = null
const logFile = () => path.join(base, 'logs', 'lector.log')

beforeEach(async () => {
  base = await fs.mkdtemp(path.join(os.tmpdir(), 'lector-log-'))
  process.env.LECTOR_TEST_USERDATA = base
})

afterEach(async () => {
  await fs.rm(base, { recursive: true, force: true })
})

describe('logLine', () => {
  it('añade la línea con su ámbito y fecha', async () => {
    await logLine('main', 'algo fallo')
    const text = await fs.readFile(logFile(), 'utf8')
    expect(text).toMatch(/^\[\d{4}-\d{2}-\d{2}T[^\]]+\] main: algo fallo\n$/)
  })

  it('acumula líneas sucesivas', async () => {
    await logLine('main', 'primera')
    await logLine('renderer', 'segunda')
    const text = await fs.readFile(logFile(), 'utf8')
    expect(text).toContain('main: primera')
    expect(text).toContain('renderer: segunda')
  })

  it('rota el fichero cuando supera el límite', async () => {
    await fs.mkdir(path.dirname(logFile()), { recursive: true })
    await fs.writeFile(logFile(), 'x'.repeat(LOG_LIMIT + 1), 'utf8')

    await logLine('main', 'tras la rotacion')

    const fresh = await fs.readFile(logFile(), 'utf8')
    expect(fresh).toContain('tras la rotacion')
    expect(fresh.length).toBeLessThan(1000)
    const old = await fs.readFile(`${logFile()}.1`, 'utf8')
    expect(old.length).toBe(LOG_LIMIT + 1)
  })
})
