// Panel de ajustes de lectura. Todo se aplica en vivo: se ve el efecto sobre
// el propio texto mientras se mueve el control.
//
// Los ajustes no son los mismos en las dos vistas —la tipografia solo importa
// cuando el texto se re-maqueta, y la ampliacion solo cuando se ensena la
// pagina—, asi que el panel muestra unicamente lo que hace algo ahora mismo.

import { h, segmented } from '../ui/dom.js'
import { FONTS, THEMES } from './settings.js'
import { MODES, isFlowMode } from '../reader/mode.js'

const READING_MODES = [
  { id: 'auto', label: 'Automático' },
  { id: 'flow', label: 'Línea a línea' },
  { id: 'sentence', label: 'Frase a frase' },
  { id: 'page', label: 'Párrafo a párrafo' }
]

const MODE_NOTES = {
  flow: 'El texto se re-maqueta a tu medida y se resalta una línea cada vez.',
  sentence: 'Como línea a línea, pero avanzando por frases enteras: la unidad es el sentido y no donde cortó el maquetador.',
  page: 'Se muestra la página original y se resalta un párrafo o una figura cada vez.'
}

const SLIDERS = {
  flow: [
    { key: 'fontSize', label: 'Tamaño', min: 14, max: 34, step: 1, unit: 'px' },
    { key: 'lineHeight', label: 'Interlineado', min: 1.3, max: 2.4, step: 0.05, unit: '' },
    { key: 'columnWidth', label: 'Ancho de columna', min: 380, max: 900, step: 20, unit: 'px' },
    { key: 'focusLines', label: 'Líneas en foco', min: 1, max: 5, step: 1, unit: '' }
  ],
  page: [
    { key: 'pageZoom', label: 'Ampliación', min: 1, max: 2.6, step: 0.1, unit: '×' }
  ],
  both: [
    { key: 'blurAmount', label: 'Desenfoque', min: 0, max: 8, step: 0.2, unit: 'px' },
    { key: 'dimOpacity', label: 'Texto atenuado', min: 0.08, max: 1, step: 0.02, unit: '' },
    { key: 'falloffLines', label: 'Difuminado del borde', min: 0, max: 4, step: 0.2, unit: '' }
  ]
}

/**
 * @param {Object} options
 * @param {Function} options.currentMode devuelve 'flow' o 'page' en uso ahora
 * @param {Function} options.onReadingMode se llama al cambiar el tipo de lectura
 */
export function createSettingsPanel ({ settings, currentMode, onReadingMode, onClose }) {
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

  const field = (label, control, note) => h('div', { class: 'field' },
    h('div', { class: 'field-label' }, h('span', { text: label })),
    control,
    note ? h('p', { class: 'field-note', text: note }) : null
  )

  function render () {
    const mode = currentMode()
    const chosen = settings.get('readingMode')
    const guided = settings.get('focusEnabled') !== false

    // replaceChildren convierte en texto lo que no sea un nodo, asi que un
    // campo omitido escribiria literalmente "null" en el panel.
    const parts = [
      field('Tipo de lectura',
        segmented(READING_MODES, chosen, id => {
          if (id === chosen) return
          settings.update({ readingMode: id })
          render()
          onReadingMode(id)
        }),
        chosen === 'auto'
          ? `Elegido para este documento: ${MODES[mode]?.label.toLowerCase() ?? mode}.`
          : MODE_NOTES[chosen]
      ),

      field('Guía de lectura', segmented(
        [{ id: 'on', label: 'Activada' }, { id: 'off', label: 'Desactivada' }],
        guided ? 'on' : 'off',
        id => { settings.update({ focusEnabled: id === 'on' }); render() }),
      guided ? null : 'El texto se ve entero y sin desenfoque. Sigues avanzando con la rueda.'),

      field('Tema', segmented(THEMES, settings.get('theme'),
        id => { settings.update({ theme: id }); render() })),

      // La tipografia y la alineacion no pintan nada sobre la pagina original.
      isFlowMode(mode)
        ? field('Tipografía', h('select', {
            onchange: event => settings.update({ fontFamily: event.target.value })
          }, FONTS.map(font => h('option', {
            value: font.id,
            selected: font.id === settings.get('fontFamily'),
            text: font.label
          }))))
        : null,

      isFlowMode(mode)
        ? field('Alineación', segmented(
            [{ id: 'left', label: 'Izquierda' }, { id: 'justify', label: 'Justificado' }],
            settings.get('textAlign'),
            id => { settings.update({ textAlign: id }); render() }))
        : null,

      ...SLIDERS[isFlowMode(mode) ? 'flow' : 'page']
        // Las lineas en foco no pintan nada con la guia apagada.
        .filter(spec => guided || spec.key !== 'focusLines')
        .map(slider),
      // Y estos tres son el efecto en si.
      ...(guided ? SLIDERS.both.map(slider) : []),

      h('p', { class: 'panel-hint' },
        'Rueda del ratón o ', h('kbd', { text: '↓' }), ' ', h('kbd', { text: '↑' }),
        mode === 'page' ? ' para pasar de región. ' : mode === 'sentence' ? ' para avanzar frase a frase. ' : ' para avanzar línea a línea. ',
        h('kbd', { text: '←' }), ' ', h('kbd', { text: '→' }), ' cambia de capítulo, ',
        h('kbd', { text: 'M' }), ' marca donde estás y ',
        h('kbd', { text: 'V' }), ' cambia de vista.'
      )
    ]

    body.replaceChildren(...parts.filter(Boolean))
  }

  render()

  return {
    element: panel,
    refresh: render,
    open: () => { render(); panel.classList.add('is-open') },
    close: () => panel.classList.remove('is-open'),
    toggle: () => panel.classList.toggle('is-open'),
    get isOpen () { return panel.classList.contains('is-open') }
  }
}

function format (value, spec) {
  const decimals = spec.step < 1 ? 2 : 0
  return `${Number(value).toFixed(decimals).replace(/\.00$/, '')}${spec.unit}`
}
