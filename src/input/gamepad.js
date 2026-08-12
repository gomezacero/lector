const DEFAULT_MAPPING = Object.freeze({ next: 0, previous: 1, pageNext: 5, pagePrevious: 4 })

export function createGamepadAdapter ({ commands, mapping: initialMapping = DEFAULT_MAPPING, windowRef = globalThis }) {
  let mapping = { ...DEFAULT_MAPPING, ...initialMapping }
  let enabled = false
  let frame = null
  let previous = []

  function poll () {
    if (!enabled) return
    const pad = windowRef.navigator?.getGamepads?.()?.find(Boolean)
    if (pad) {
      const pressed = pad.buttons.map(button => button.pressed)
      trigger(pressed, mapping.next, 'reader.move', 1)
      trigger(pressed, mapping.previous, 'reader.move', -1)
      trigger(pressed, mapping.pageNext, 'reader.page', 1)
      trigger(pressed, mapping.pagePrevious, 'reader.page', -1)
      previous = pressed
    }
    frame = windowRef.requestAnimationFrame(poll)
  }

  function trigger (pressed, button, command, payload) {
    if (pressed[button] && !previous[button]) commands.run(command, payload)
  }

  function setEnabled (next) {
    enabled = Boolean(next)
    if (enabled && frame == null) frame = windowRef.requestAnimationFrame(poll)
    if (!enabled && frame != null) {
      windowRef.cancelAnimationFrame(frame)
      frame = null
      previous = []
    }
  }

  return {
    setEnabled,
    setMapping: next => { mapping = { ...mapping, ...next } },
    destroy: () => setEnabled(false),
    get enabled () { return enabled }
  }
}
