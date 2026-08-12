// Registro unico de acciones semanticas. Los adaptadores de entrada expresan
// intencion y no conocen lectores, paneles ni persistencia.

export function createCommandRegistry () {
  const handlers = new Map()

  return {
    register (command, handler) {
      if (typeof command !== 'string' || typeof handler !== 'function') {
        throw new TypeError('comando invalido')
      }
      handlers.set(command, handler)
      return () => handlers.delete(command)
    },
    run (command, payload) {
      return handlers.get(command)?.(payload)
    },
    has: command => handlers.has(command)
  }
}

export const DEFAULT_SHORTCUTS = Object.freeze({
  search: 'CmdOrCtrl+F',
  back: 'Alt+ArrowLeft',
  speech: 'CmdOrCtrl+Shift+Space'
})
