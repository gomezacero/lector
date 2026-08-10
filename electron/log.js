import { app } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'

// Registro persistente de errores bajo userData/logs/lector.log.
//
// La aplicacion empaquetada es una GUI sin consola: lo que no se escriba aqui
// no lo ve nadie (electron/devtasks.js resuelve lo mismo para las tareas de
// desarrollo con su transcript). Cuando el fichero supera el limite se
// renombra a .1 y se empieza de cero: una generacion de historia basta para
// diagnosticar y el log no crece sin techo.

export const LOG_LIMIT = 1024 * 1024

const logFile = () => path.join(app.getPath('userData'), 'logs', 'lector.log')

// En fila: dos escrituras a la vez no intercalan lineas ni pelean la rotacion.
let queue = Promise.resolve()

/** Añade una línea al log. Nunca rechaza: un log que falla no debe tirar nada. */
export function logLine (scope, message) {
  const line = `[${new Date().toISOString()}] ${scope}: ${message}\n`
  queue = queue.then(async () => {
    const file = logFile()
    await fs.mkdir(path.dirname(file), { recursive: true })
    const size = (await fs.stat(file).catch(() => null))?.size ?? 0
    if (size > LOG_LIMIT) await fs.rename(file, `${file}.1`).catch(() => {})
    await fs.appendFile(file, line, 'utf8')
  }).catch(() => {})
  return queue
}
