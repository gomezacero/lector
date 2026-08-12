import { h } from '../ui/dom.js'

const CONDITIONS = [
  ['full', 'Texto completo'], ['line', 'Guía de línea'],
  ['sentence', 'Guía de frase'], ['paged', 'Página refluida']
]

export function createStudyPanel ({ recorder, onCondition, onExport }) {
  const condition = h('select', { 'aria-label': 'Condición del estudio' },
    CONDITIONS.map(([id, label]) => h('option', { value: id, text: label })))
  const status = h('p', { class: 'study-status', text: 'Estudio local listo.' })
  const scores = Object.fromEntries(['comprehension', 'fatigue', 'placeLoss', 'preference'].map(key => [key,
    h('input', { type: 'number', min: 0, max: key === 'comprehension' ? 1 : 5, step: key === 'comprehension' ? 0.1 : 1, 'aria-label': key })
  ]))
  const sessions = []

  const panel = h('aside', { class: 'study-panel', 'aria-label': 'Estudio local' },
    h('strong', { text: 'Modo de estudio local' }), condition,
    h('button', { class: 'btn', text: 'Iniciar condición', onclick: start }),
    h('div', { class: 'study-scores' },
      label('Comprensión 0–1', scores.comprehension), label('Cansancio 0–5', scores.fatigue),
      label('Pérdida de lugar 0–5', scores.placeLoss), label('Preferencia 0–5', scores.preference)),
    h('button', { class: 'btn', text: 'Terminar condición', onclick: finish }),
    h('button', { class: 'btn btn-ghost', text: 'Exportar JSON', onclick: () => onExport([...sessions]) }),
    status)
  document.body.append(panel)

  function label (text, input) { return h('label', {}, text, input) }
  function start () {
    recorder.start(condition.value)
    onCondition(condition.value)
    status.textContent = `Midiendo: ${condition.selectedOptions[0].textContent}`
  }
  function finish () {
    if (!recorder.active) return
    const answers = Object.fromEntries(Object.entries(scores)
      .filter(([, input]) => input.value !== '')
      .map(([key, input]) => [key, Number(input.value)]))
    sessions.push(recorder.finish(answers))
    status.textContent = `${sessions.length} condición${sessions.length === 1 ? '' : 'es'} guardada${sessions.length === 1 ? '' : 's'} localmente.`
  }

  return { element: panel, sessions }
}

