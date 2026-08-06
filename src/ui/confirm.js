// Confirmacion para lo que no tiene vuelta atras.
//
// Se usa <dialog> nativo por dos cosas que hacen falta y son tediosas de
// escribir a mano: el foco queda atrapado dentro mientras esta abierto, y
// Escape cierra. El boton que cancela es el que recibe el foco al abrir, para
// que un Enter de mas no borre nada.

import { h } from './dom.js'

/**
 * @param {Object} options
 * @param {string} options.title
 * @param {Array<string>} options.lines lo que se va a perder, una cosa por linea
 * @param {string} options.confirmLabel
 * @returns {Promise<boolean>}
 */
export function confirmAction ({ title, lines = [], confirmLabel = 'Continuar' }) {
  return new Promise(resolve => {
    let answer = false

    const cancel = h('button', {
      class: 'btn',
      text: 'Cancelar',
      onclick: () => dialog.close()
    })

    const dialog = h('dialog', {
      class: 'confirm',
      // Un clic fuera del recuadro cancela, como en cualquier ventana modal.
      onclick: event => { if (event.target === dialog) dialog.close() },
      onclose: () => { dialog.remove(); resolve(answer) }
    },
    h('h2', { class: 'confirm-title', text: title }),
    lines.length
      ? h('ul', { class: 'confirm-list' }, lines.map(line => h('li', { text: line })))
      : null,
    h('div', { class: 'confirm-actions' },
      cancel,
      h('button', {
        class: 'btn btn-danger',
        text: confirmLabel,
        onclick: () => { answer = true; dialog.close() }
      })
    )
    )

    document.body.append(dialog)
    dialog.showModal()
    cancel.focus()
  })
}

/** "5,3 MB", "912 kB": el tamano se dice para que se entienda, no exacto. */
export function readableSize (bytes) {
  if (!bytes) return '0 kB'
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}
