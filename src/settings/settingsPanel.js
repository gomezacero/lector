// Panel de ajustes de lectura. Todo se aplica en vivo: se ve el efecto sobre
// el propio texto mientras se mueve el control.
//
// Los ajustes no son los mismos en las dos vistas —la tipografia solo importa
// cuando el texto se re-maqueta, y la ampliacion solo cuando se ensena la
// pagina—, asi que el panel muestra unicamente lo que hace algo ahora mismo.

import { h, segmented } from '../ui/dom.js'
import { FONTS, THEMES, TYPOGRAPHY_PRESETS } from './settings.js'
import { MODES, isFlowMode } from '../reader/mode.js'
import { contrastRatio } from '../accessibility/contrast.js'

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
    { key: 'paragraphSpacing', label: 'Espacio entre párrafos', min: 0, max: 2, step: 0.05, unit: 'em' },
    { key: 'wordSpacing', label: 'Espacio entre palabras', min: 0, max: 0.2, step: 0.01, unit: 'em' },
    { key: 'letterSpacing', label: 'Espacio entre caracteres', min: 0, max: 0.08, step: 0.005, unit: 'em' },
    { key: 'fontWeight', label: 'Peso tipográfico', min: 300, max: 700, step: 100, unit: '' },
    { key: 'verticalMargin', label: 'Márgenes verticales', min: 24, max: 120, step: 4, unit: 'px' },
    { key: 'focusLines', label: 'Líneas en foco', min: 1, max: 5, step: 1, unit: '' }
  ],
  page: [
    { key: 'pageZoom', label: 'Ampliación', min: 1, max: 2.6, step: 0.1, unit: '×' },
    { key: 'focusLines', label: 'Líneas en foco', min: 1, max: 8, step: 1, unit: '' }
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
export function createSettingsPanel ({ settings, currentMode, onReadingMode, onPresentation, onClose, canRecognize, onRecognize, speechVoices, onClearVocabulary, onClearStats }) {
  const body = h('div', { class: 'panel-body' })

  const panel = h('aside', {
    class: 'panel settings-panel', hidden: true, dataset: { panel: 'settings' },
    'aria-label': 'Ajustes de lectura'
  },
    h('div', { class: 'panel-head' },
      h('div', { class: 'panel-title' },
        h('span', { class: 'panel-eyebrow', text: 'Personalización' }),
        h('h2', { text: 'Ajustes de lectura' })),
      h('button', {
        class: 'panel-close', text: '×', title: 'Cerrar ajustes',
        'aria-label': 'Cerrar ajustes', onclick: onClose
      })
    ),
    body
  )
  // Ritmo es una función principal de lectura, no un ajuste avanzado. Abierto
  // de inicio resulta descubrible sin obligar a conocer el acordeón del panel.
  const expanded = new Set(['reading', 'rhythm', 'typography'])
  panel.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    onClose?.()
  })

  function section (id, title, description, parts) {
    const details = h('details', {
      class: 'settings-section', dataset: { settingsSection: id },
      open: expanded.has(id)
    },
    h('summary', {},
      h('span', { class: 'settings-section-heading' },
        h('strong', { text: title }),
        description ? h('small', { text: description }) : null),
      h('span', { class: 'settings-section-chevron', text: '⌄', 'aria-hidden': 'true' })),
    h('div', { class: 'settings-section-body' }, parts.filter(Boolean)))
    details.addEventListener('toggle', () => {
      if (details.open) expanded.add(id)
      else expanded.delete(id)
    })
    return details
  }

  function slider (spec) {
    // label for + id: sin la pareja, un lector de pantalla anuncia
    // "control deslizante, 20" sin decir de que es.
    const id = `set-${spec.key}`
    const value = h('span', { class: 'field-value', text: format(settings.get(spec.key), spec) })
    const input = h('input', {
      id,
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
      h('div', { class: 'field-label' }, h('label', { for: id, text: spec.label }), value),
      input
    )
  }

  const field = (label, control, note, forId) => h('div', { class: 'field' },
    h('div', { class: 'field-label' },
      forId ? h('label', { for: forId, text: label }) : h('span', { text: label })),
    control,
    note ? h('p', { class: 'field-note', text: note }) : null
  )

  function render () {
    const mode = currentMode()
    const chosen = settings.get('readingMode')
    const guided = settings.get('focusEnabled') !== false
    const voices = speechVoices?.() ?? []
    const flow = isFlowMode(mode)
    const focusSlider = SLIDERS[flow ? 'flow' : 'page'].find(spec => spec.key === 'focusLines')

    const reading = [
      field('Tipo de lectura', segmented(READING_MODES, chosen, id => {
        if (id === chosen) return
        settings.update({ readingMode: id })
        render()
        onReadingMode(id)
      }, 'Tipo de lectura'), chosen === 'auto'
        ? `Elegido para este documento: ${MODES[mode]?.label.toLowerCase() ?? mode}.`
        : MODE_NOTES[chosen]),
      field('Guía de lectura', segmented(
        [{ id: 'on', label: 'Activada' }, { id: 'off', label: 'Desactivada' }],
        guided ? 'on' : 'off',
        id => { settings.update({ focusEnabled: id === 'on' }); render() },
        'Guía de lectura'), guided ? null : 'Muestra el texto completo, sin atenuación ni desenfoque.'),
      flow ? field('Presentación', segmented([
        { id: 'continuous', label: 'Continua' },
        { id: 'paged', label: 'Paginada · Beta' }
      ], settings.get('presentationMode') ?? 'continuous', id => {
        settings.update({ presentationMode: id })
        onPresentation?.(id)
        render()
      }, 'Presentación'), settings.get('presentationMode') === 'paged'
        ? 'Reemplaza una pantalla completa cada vez y conserva tu posición al redimensionar.'
        : 'El texto avanza de forma continua manteniendo el foco en la zona de lectura.') : null,
      !flow ? field('Recorrido de la página', segmented(
        [{ id: 'block', label: 'Por párrafo' }, { id: 'lines', label: 'Por líneas' }],
        settings.get('pageStop') ?? 'block',
        id => { settings.update({ pageStop: id }); render() }, 'Recorrido de la página'),
      settings.get('pageStop') === 'lines'
        ? 'Avanza por grupos de renglones sobre la página original.'
        : 'Se detiene en cada párrafo, figura o región detectada.') : null,
      !flow ? slider(SLIDERS.page.find(spec => spec.key === 'pageZoom')) : null
    ]

    const typography = flow ? [
      field('Preset', h('select', {
        id: 'set-typographyPreset',
        onchange: event => {
          const id = event.target.value
          if (id === 'custom') return
          settings.update({ typographyPreset: id, ...TYPOGRAPHY_PRESETS[id] })
          render()
        }
      }, [['compact', 'Compacto'], ['novel', 'Novela'], ['relaxed', 'Relajado'],
        ['legible', 'Alta legibilidad'], ['custom', 'Personalizado']]
        .map(([id, label]) => h('option', {
          value: id, selected: id === settings.get('typographyPreset'), text: label
        }))), 'Se guarda de forma independiente para este libro.', 'set-typographyPreset'),
      field('Fuente', h('select', {
        id: 'set-fontFamily',
        onchange: event => settings.update({ fontFamily: event.target.value })
      }, FONTS.map(font => h('option', {
        value: font.id, selected: font.id === settings.get('fontFamily'), text: font.label
      }))), null, 'set-fontFamily'),
      field('Alineación', segmented(
        [{ id: 'left', label: 'Izquierda' }, { id: 'justify', label: 'Justificado' }],
        settings.get('textAlign'),
        id => { settings.update({ textAlign: id }); render() }, 'Alineación')),
      ...SLIDERS.flow.filter(spec => spec.key !== 'focusLines').map(slider)
    ] : []

    const focus = [
      guided && focusSlider && (flow || settings.get('pageStop') === 'lines') ? slider(focusSlider) : null,
      ...(guided ? SLIDERS.both.map(slider) : [])
    ].filter(Boolean)

    const appearance = [
      field('Tema', segmented(THEMES, settings.get('theme'),
        id => { settings.update({ theme: id }); render() }, 'Tema')),
      settings.get('theme') === 'custom' ? customColors() : null
    ]

    const rhythm = [
      field('Ritmo de lectura', segmented([
        { id: 'off', label: 'Oculto' },
        { id: 'guided', label: 'Guía' },
        { id: 'auto', label: 'Automático' }
      ], settings.get('rhythmMode') ?? 'guided', id => {
        settings.update({ rhythmMode: id })
        render()
      }, 'Ritmo de lectura'), settings.get('rhythmMode') === 'auto'
        ? 'Avanza al completar el tiempo estimado. Se pausa con paneles, voz o al salir de la ventana.'
        : 'La guía aprende de tu lectura y respeta pausas de puntuación; no mueve el texto.'),
      settings.get('rhythmMode') !== 'off'
        ? slider({ key: 'readingTargetWpm', label: 'Velocidad de avance', min: 40, max: 500, step: 10, unit: ' ppm' })
        : null,
      h('p', { class: 'settings-message', text: 'Se aplica inmediatamente y se mantiene como tu elección. Las pausas de puntuación se añaden encima de este ritmo.' })
    ]

    const audio = voices.length ? [
      slider({ key: 'speechRate', label: 'Velocidad', min: 0.7, max: 2, step: 0.1, unit: '×' }),
      field('Idioma', segmented([
        { id: 'auto', label: 'Automático' }, { id: 'es', label: 'Español' }, { id: 'en', label: 'Inglés' }
      ], settings.get('speechLanguage') ?? 'auto', id => settings.update({ speechLanguage: id }), 'Idioma de voz')),
      voices.some(voice => voice.lang?.toLowerCase().startsWith('es'))
        ? field('Voz en español', voiceSelect('es', 'speechVoiceEs'), null, 'set-speechVoiceEs') : null,
      voices.some(voice => voice.lang?.toLowerCase().startsWith('en'))
        ? field('Voz en inglés', voiceSelect('en', 'speechVoiceEn'), null, 'set-speechVoiceEn') : null,
      field('Temporizador', h('select', {
        id: 'set-speechTimer',
        onchange: event => settings.update({ speechTimer: event.target.value })
      }, [['off', 'Sin temporizador'], ['5', '5 minutos'], ['10', '10 minutos'],
        ['15', '15 minutos'], ['30', '30 minutos'], ['chapter', 'Fin del capítulo']]
        .map(([id, label]) => h('option', {
          value: id, selected: settings.get('speechTimer') === id, text: label
        }))), null, 'set-speechTimer')
    ] : [h('p', { class: 'settings-message', text: 'No hay voces locales compatibles disponibles en el sistema.' })]

    const interfaceFields = [
      field('Movimiento', segmented([
        { id: 'system', label: 'Sistema' }, { id: 'reduce', label: 'Reducido' }, { id: 'full', label: 'Completo' }
      ], settings.get('motion') ?? 'system', id => settings.update({ motion: id }), 'Movimiento')),
      slider({ key: 'uiScale', label: 'Escala de interfaz', min: 100, max: 200, step: 10, unit: '%' }),
      field('Progreso', segmented([
        { id: 'on', label: 'Visible' }, { id: 'off', label: 'Oculto' }
      ], settings.get('showProgress') === false ? 'off' : 'on', id => settings.update({ showProgress: id === 'on' }), 'Progreso')),
      field('Tiempo restante', segmented([
        { id: 'on', label: 'Visible' }, { id: 'off', label: 'Oculto' }
      ], settings.get('showEta') === false ? 'off' : 'on', id => settings.update({ showEta: id === 'on' }), 'Tiempo restante'))
    ]

    const wellbeingFields = [
      field('Aviso de descanso', segmented([
        { id: '0', label: 'Nunca' }, { id: '20', label: '20 min' },
        { id: '30', label: '30 min' }, { id: '40', label: '40 min' }
      ], String(settings.get('breakInterval') ?? 0), id => settings.update({ breakInterval: Number(id) }), 'Aviso de descanso')),
      field('Estadísticas locales', segmented([
        { id: 'off', label: 'Desactivadas' }, { id: 'on', label: 'Activadas' }
      ], settings.get('collectReadingStats') ? 'on' : 'off', id => {
        const enabled = id === 'on'
        settings.update({ collectReadingStats: enabled })
        if (!enabled) onClearStats?.()
      }, 'Estadísticas locales'), 'Todo permanece en este equipo.'),
      settings.get('collectReadingStats')
        ? field('', h('button', { class: 'btn btn-ghost', text: 'Borrar estadísticas', onclick: onClearStats })) : null,
      field('Historial del diccionario', segmented([
        { id: 'off', label: 'No guardar' }, { id: 'on', label: 'Guardar' }
      ], settings.get('vocabularyHistory') ? 'on' : 'off',
      id => settings.update({ vocabularyHistory: id === 'on' }), 'Historial del diccionario')),
      settings.get('vocabularyHistory')
        ? field('', h('button', { class: 'btn btn-ghost', text: 'Borrar palabras consultadas', onclick: onClearVocabulary })) : null
    ]

    const controls = [
      field('Gamepad', segmented([
        { id: 'off', label: 'Desactivado' }, { id: 'on', label: 'Activado' }
      ], settings.get('gamepadEnabled') ? 'on' : 'off',
      id => { settings.update({ gamepadEnabled: id === 'on' }); render() }, 'Gamepad')),
      settings.get('gamepadEnabled') ? field('Asignación de botones', h('div', { class: 'gamepad-map' },
        gamepadSelect('Avanzar', 'gamepadNextButton'), gamepadSelect('Retroceder', 'gamepadPreviousButton'),
        gamepadSelect('Página siguiente', 'gamepadPageNextButton'), gamepadSelect('Página anterior', 'gamepadPagePreviousButton')),
      'Los pedales que emulan teclado utilizan los atajos normales.') : null,
      h('p', { class: 'panel-hint' },
        h('kbd', { text: '↓' }), ' ', h('kbd', { text: '↑' }), ' avanzan la lectura · ',
        h('kbd', { text: '←' }), ' ', h('kbd', { text: '→' }), ' cambian de capítulo · ',
        h('kbd', { text: 'M' }), ' añade o quita la marca actual · ',
        h('kbd', { text: 'V' }), ' cambia de vista.')
    ]

    const documentFields = canRecognize?.() ? [
      field('Reconocimiento de texto', h('button', {
        class: 'btn', text: 'Reconocer páginas con OCR', onclick: () => onRecognize?.()
      }), 'Quedan páginas escaneadas o dañadas. El proceso se ejecuta completamente en este equipo.')
    ] : [h('p', { class: 'settings-message', text: 'El documento no necesita acciones adicionales.' })]

    body.replaceChildren(
      section('reading', 'Lectura', 'Modo, guía y presentación', reading),
      section('rhythm', 'Ritmo', 'Velocidad, pausas y avance', rhythm),
      ...(flow ? [section('typography', 'Texto y tipografía', 'Fuente, tamaño, ancho y espaciado', typography)] : []),
      section('focus', 'Enfoque visual', 'Intensidad y extensión de la guía', focus.length
        ? focus
        : [h('p', { class: 'settings-message', text: 'Activa la guía de lectura para configurar su intensidad.' })]),
      section('appearance', 'Apariencia', 'Tema y colores', appearance),
      section('audio', 'Lectura en voz alta', 'Voz, velocidad y temporizador', audio),
      section('interface', 'Interfaz y accesibilidad', 'Movimiento, escala e información', interfaceFields),
      section('wellbeing', 'Comodidad y privacidad', 'Descansos y datos locales', wellbeingFields),
      section('controls', 'Controles', 'Teclado, pedales y gamepad', controls),
      section('document', 'Documento', 'Procesamiento local del PDF', documentFields)
    )
  }

  function voiceSelect (language, key) {
    return h('select', {
      id: `set-${key}`,
      onchange: event => settings.update({ [key]: event.target.value })
    }, speechVoices().filter(voice => voice.lang?.toLowerCase().startsWith(language))
      .map(voice => h('option', { value: voice.name, selected: settings.get(key) === voice.name, text: voice.name })))
  }

  function customColors () {
    const background = settings.get('customBackground') || '#14161a'
    const foreground = settings.get('customForeground') || '#e6e3dc'
    const accent = settings.get('customAccent') || '#7aa2f7'
    const ratio = contrastRatio(background, foreground)
    const color = (label, key, value) => field(label, h('input', {
      type: 'color', value,
      onchange: event => { settings.update({ [key]: event.target.value }); render() }
    }))
    return h('div', { class: 'custom-theme' },
      color('Fondo', 'customBackground', background),
      color('Texto', 'customForeground', foreground),
      color('Acento', 'customAccent', accent),
      h('p', {
        class: `field-note ${ratio < 4.5 ? 'is-warning' : ''}`,
        text: `Contraste texto/fondo: ${ratio.toFixed(1)}:1${ratio < 4.5 ? ' — por debajo de AA.' : ''}`
      }))
  }

  function gamepadSelect (label, key) {
    return h('label', {}, label, h('select', {
      onchange: event => settings.update({ [key]: Number(event.target.value) })
    }, Array.from({ length: 16 }, (_, button) => h('option', {
      value: button, selected: settings.get(key) === button, text: `Botón ${button}`
    }))))
  }

  render()
  // Cerrado no debe recibir el tabulador: solo esta apartado con transform,
  // que no lo saca ni del orden de foco ni del arbol de accesibilidad.
  panel.inert = true

  return {
    element: panel,
    refresh: render,
    open: () => {
      render()
      panel.hidden = false
      panel.inert = false
      panel.classList.add('is-open')
    },
    close: () => {
      if (panel.contains(document.activeElement)) document.activeElement.blur()
      panel.classList.remove('is-open')
      panel.inert = true
      panel.hidden = true
    },
    toggle () { this.isOpen ? this.close() : this.open() },
    get isOpen () { return panel.classList.contains('is-open') }
  }
}

function format (value, spec) {
  const decimals = spec.step < 1 ? 2 : 0
  return `${Number(value).toFixed(decimals).replace(/\.00$/, '')}${spec.unit}`
}
