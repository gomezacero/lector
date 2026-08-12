// Lanza una tarea de desarrollo de Electron pasando las variables de entorno
// desde Node, para que el comando funcione igual en PowerShell y en bash.
//
//   node scripts/run-electron-task.mjs smoke
//   node scripts/run-electron-task.mjs ingest test/fixtures/libro-prueba.pdf

import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
// Fuera de Electron, el paquete exporta la ruta del binario: se invoca directo
// y asi no hace falta shell (que en Windows no escapa los argumentos).
import electron from 'electron'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const [task, arg] = process.argv.slice(2)

if (!task) {
  console.error('Uso: node scripts/run-electron-task.mjs <smoke|ingest|read|visual|study|tts> [argumento]')
  process.exit(2)
}

const child = spawn(electron, ['.'], {
  cwd: projectRoot,
  stdio: 'inherit',
  env: { ...process.env, LECTOR_TASK: task, LECTOR_TASK_ARG: arg ?? '' }
})

child.on('exit', code => process.exit(code ?? 1))
