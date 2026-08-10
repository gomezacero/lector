// Rueda y teclado -> movimientos del foco.
//
// La rueda tiene truco: un raton manda saltos de ~100px por muesca y un
// trackpad manda docenas de eventos diminutos. Tratarlos igual hace que o el
// raton vuele o el trackpad no responda, asi que se distinguen.

const WHEEL_STEP = 26 // pixeles acumulados por linea en gestos continuos
const DISCRETE_DELTA = 45 // por encima de esto es una muesca de raton

export function attachNavigation (target, handlers) {
  let accumulated = 0

  function onWheel (event) {
    event.preventDefault()

    const delta = event.deltaMode === 0 ? event.deltaY : event.deltaY * 40
    const direction = Math.sign(delta)

    if (Math.abs(delta) >= DISCRETE_DELTA) {
      // Muesca de raton: una muesca, una linea. Sin acumular.
      accumulated = 0
      handlers.move(direction)
      return
    }

    // Trackpad: se suma hasta completar una linea y se guarda el resto, para
    // que un gesto largo avance de forma continua y no a tirones.
    if (Math.sign(accumulated) !== direction) accumulated = 0
    accumulated += delta

    const steps = Math.trunc(accumulated / WHEEL_STEP)
    if (steps !== 0) {
      accumulated -= steps * WHEEL_STEP
      handlers.move(steps)
    }
  }

  function onKeyDown (event) {
    // Mientras se escribe una nota, el teclado es de la nota.
    const tag = event.target?.tagName
    if (tag === 'TEXTAREA' || tag === 'INPUT') {
      if (event.key === 'Escape') handlers.escape?.()
      return
    }
    // Espacio y Enter activan el boton o el select con foco: robarselos para
    // mover el texto dejaria los controles inoperables con teclado.
    if ((tag === 'BUTTON' || tag === 'SELECT') && (event.key === ' ' || event.key === 'Enter')) {
      return
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return

    const action = KEYS[event.key]
    if (!action) return
    event.preventDefault()
    action(handlers, event)
  }

  target.addEventListener('wheel', onWheel, { passive: false })
  window.addEventListener('keydown', onKeyDown)

  return () => {
    target.removeEventListener('wheel', onWheel)
    window.removeEventListener('keydown', onKeyDown)
  }
}

const KEYS = {
  ArrowDown: h => h.move(1),
  ArrowUp: h => h.move(-1),
  ' ': (h, e) => h.move(e.shiftKey ? -1 : 1),
  Enter: h => h.move(1),
  Backspace: h => h.move(-1),
  j: h => h.move(1),
  k: h => h.move(-1),
  PageDown: h => h.page(1),
  PageUp: h => h.page(-1),
  Home: h => h.jump('start'),
  End: h => h.jump('end'),
  ArrowRight: h => h.chapter(1),
  ArrowLeft: h => h.chapter(-1),
  m: h => h.bookmark?.(),
  M: h => h.bookmark?.(),
  v: h => h.mode?.(),
  V: h => h.mode?.(),
  Escape: h => h.escape?.()
}
