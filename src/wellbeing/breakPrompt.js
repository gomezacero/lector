import { h } from '../ui/dom.js'

export function createBreakPrompt ({ onPause, onPostpone, onDisable }) {
  const message = h('p', { text: 'Has leído un buen rato. Mira a lo lejos o cambia de postura cuando te venga bien.' })
  const dialog = h('div', { class: 'break-overlay', hidden: true, role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Pausa de lectura' },
    h('div', { class: 'break-card' }, h('h2', { text: 'Un descanso suave' }), message,
      h('div', { class: 'break-actions' },
        h('button', { class: 'btn btn-primary', text: '20 segundos', onclick: () => pause(20_000) }),
        h('button', { class: 'btn', text: '5 minutos', onclick: () => pause(300_000) }),
        h('button', { class: 'btn btn-ghost', text: 'Seguir leyendo', onclick: close }),
        h('button', { class: 'btn btn-ghost', text: 'Posponer', onclick: postpone }),
        h('button', { class: 'btn btn-ghost', text: 'Desactivar', onclick: disable }))))
  document.body.append(dialog)
  let timer = null

  function open () { dialog.hidden = false; dialog.querySelector('button')?.focus() }
  function close () { dialog.hidden = true; clearTimeout(timer); document.getElementById('stage')?.focus() }
  function pause (milliseconds) {
    onPause?.(milliseconds)
    const seconds = Math.round(milliseconds / 1000)
    message.textContent = milliseconds < 60_000 ? `Descansa ${seconds} segundos…` : 'Pausa larga iniciada. Puedes volver cuando quieras.'
    timer = setTimeout(close, milliseconds)
  }
  function postpone () { onPostpone?.(); close() }
  function disable () { onDisable?.(); close() }

  return { element: dialog, open, close, get isOpen () { return !dialog.hidden } }
}
