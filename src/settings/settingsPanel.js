// Panel de ajustes de lectura. Todo se aplica en vivo: se ve el efecto sobre
// el propio texto mientras se mueve el control.

import { h, segmented } from '../ui/dom.js'
import { FONTS, THEMES } from './settings.js'

const SLIDERS = [
  { key: 'fontSize', label: 'Tamaño', min: 14, max: 34, step: 1, unit: 'px' },
  { key: 'lineHeight', label: 'Interlineado', min: 1.3, max: 2.4, step: 0.05, unit: '' },
  { key: 'columnWidth', label: 'Ancho de columna', min: 380, max: 900, step: 20, unit: 'px' },
  { key: 'blurAmount', label: 'Desenfoque', min: 0, max: 8, step: 0.2, unit: 'px' },
  { key: 'dimOpacity', label: 'Texto atenuado', min: 0.08, max: 1, step: 0.02, unit: '' },
  { key: 'focusLines', label: 'Líneas en foco', min: 1, max: 5, step: 1, unit: '' },
  { key: 'falloffLines', label: 'Difuminado del borde', min: 0, max: 4, step: 0.2, unit: '' }
]

export function createSettingsPanel ({ settings, onClose }) {
  const body = h('div', { class: 'panel-body' })

  const panel = h('aside', { class: 'panel' },
    h('div', { class: 'panel-head' },
      h('h2', { text: 'Lectura' }),
      h('button', { class: 'panel-close', text: '×', title: 'Cerrar', onclick: onClose })
    ),
    body
  )

  function slider (spec) {
    const value = h('span', { class: 'field-value', text: format(settings.get(spec.key), spec) })
    const input = h('input', {
      type: 'range',
      min: spec.min,
      max: spec.max,
      step: spec.step,
      value: settings.get(spec.key),
      oninput: event => {
        const next = Number(event.target.value)
        value.textContent = format(next, spec)
        settings.update({ [spec.key]: next })
      }
    })

    return h('div', { class: 'field' },
      h('div', { class: 'field-label' }, h('span', { text: spec.label }), value),
      input
    )
  }

  function render () {
    body.replaceChildren(
      h('div', { class: 'field' },
        h('div', { class: 'field-label' }, h('span', { text: 'Tema' })),
        segmented(THEMES, settings.get('theme'), id => { settings.update({ theme: id }); render() })
      ),

      h('div', { class: 'field' },
        h('div', { class: 'field-label' }, h('span', { text: 'Tipografía' })),
        h('select', {
          onchange: event => settings.update({ fontFamily: event.target.value })
        }, FONTS.map(font => h('option', {
          value: font.id,
          selected: font.id === settings.get('fontFamily'),
          text: font.label
        })))
      ),

      h('div', { class: 'field' },
        h('div', { class: 'field-label' }, h('span', { text: 'Alineación' })),
        segmented(
          [{ id: 'left', label: 'Izquierda' }, { id: 'justify', label: 'Justificado' }],
          settings.get('textAlign'),
          id => { settings.update({ textAlign: id }); render() }
        )
      ),

      ...SLIDERS.map(slider),

      h('p', { class: 'panel-hint' },
        'Rueda del ratón o ', h('kbd', { text: '↓' }), ' ', h('kbd', { text: '↑' }),
        ' para avanzar línea a línea. ', h('kbd', { text: '←' }), ' ', h('kbd', { text: '→' }),
        ' cambia de capítulo, ', h('kbd', { text: 'M' }), ' marca la línea actual.'
      )
    )
  }

  render()

  return {
    element: panel,
    open: () => panel.classList.add('is-open'),
    close: () => panel.classList.remove('is-open'),
    toggle: () => panel.classList.toggle('is-open'),
    get isOpen () { return panel.classList.contains('is-open') }
  }
}

function format (value, spec) {
  const decimals = spec.step < 1 ? 2 : 0
  return `${Number(value).toFixed(decimals).replace(/\.00$/, '')}${spec.unit}`
}
