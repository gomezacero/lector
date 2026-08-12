import { h, percent } from '../ui/dom.js'

export function createSearchPanel ({ onClose, onSearch, onGo, onBack, canBack }) {
  const input = h('input', {
    class: 'search-input', type: 'text', maxlength: 256, autocomplete: 'off',
    placeholder: 'Nombre, lugar o frase…', 'aria-label': 'Buscar en el libro'
  })
  const clear = h('button', {
    class: 'search-clear', text: '×', hidden: true,
    title: 'Limpiar búsqueda', 'aria-label': 'Limpiar búsqueda',
    onclick: () => {
      clearTimeout(timer)
      input.value = ''
      clear.hidden = true
      summary.textContent = 'Escribe al menos dos caracteres.'
      results.replaceChildren()
      generation++
      input.focus()
    }
  })
  const summary = h('p', { class: 'search-summary', text: 'Escribe al menos dos caracteres.' })
  const results = h('div', { class: 'search-results', role: 'listbox', 'aria-label': 'Resultados' })
  const back = h('button', {
    class: 'panel-action', text: '← Volver', title: 'Volver a donde estabas (Alt+←)',
    onclick: () => onBack?.()
  })
  const panel = h('aside', {
    class: 'panel search-panel', hidden: true, dataset: { panel: 'search' },
    'aria-label': 'Buscar en el libro'
  },
    h('div', { class: 'panel-head' },
      h('div', { class: 'panel-title' },
        h('span', { class: 'panel-eyebrow', text: 'Herramientas' }),
        h('h2', { text: 'Buscar en el libro' })),
      h('div', { class: 'panel-head-actions' }, back,
        h('button', {
          class: 'panel-close', text: '×', title: 'Cerrar búsqueda',
          'aria-label': 'Cerrar búsqueda', onclick: onClose
        }))),
    h('div', { class: 'panel-body' },
      h('div', { class: 'search-box' }, input, clear),
      summary,
      results))
  panel.inert = true
  let timer = null
  let generation = 0

  async function run () {
    const own = ++generation
    if (input.value.trim().length < 2) {
      summary.textContent = 'Escribe al menos dos caracteres.'
      results.replaceChildren()
      return
    }
    summary.textContent = 'Buscando…'
    const found = await onSearch(input.value)
    if (own !== generation) return
    summary.textContent = found.length === 1 ? '1 resultado' : `${found.length} resultados`
    results.replaceChildren(...found.map(result => h('button', {
      class: 'search-result', role: 'option', onclick: () => onGo(result)
    }, h('span', { class: 'search-context', text: result.context }),
    h('span', {
      class: 'search-where',
      text: `${result.chapterTitle ?? 'Sin capítulo'} · p. ${result.page + 1} · ${percent(result.percent)}`
    }))))
  }

  input.addEventListener('input', () => {
    clear.hidden = input.value.length === 0
    clearTimeout(timer)
    timer = setTimeout(run, 80)
  })
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') results.querySelector('button')?.click()
  })
  panel.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    onClose?.()
  })

  return {
    element: panel,
    open () {
      panel.hidden = false
      panel.inert = false
      panel.classList.add('is-open')
      refresh()
      setTimeout(() => input.focus(), 0)
    },
    close () {
      clearTimeout(timer)
      if (panel.contains(document.activeElement)) document.activeElement.blur()
      panel.classList.remove('is-open')
      panel.inert = true
      panel.hidden = true
      generation++
    },
    refresh,
    get isOpen () { return panel.classList.contains('is-open') }
  }

  function refresh () {
    const available = canBack()
    back.disabled = !available
    back.hidden = !available
  }
}
