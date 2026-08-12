import { h } from '../ui/dom.js'

export function createDictionaryPopover ({ provider, onRemember, preferredLanguage }) {
  const input = h('input', { type: 'search', maxlength: 200, 'aria-label': 'Palabra que definir' })
  const language = h('select', { 'aria-label': 'Idioma del diccionario' },
    h('option', { value: 'es', text: 'ES' }), h('option', { value: 'en', text: 'EN' }))
  const content = h('div', { class: 'dictionary-content' })
  const pop = h('section', { class: 'dictionary-pop', hidden: true, role: 'dialog', 'aria-label': 'Diccionario' },
    h('div', { class: 'dictionary-head' }, input, language,
      h('button', { class: 'panel-close', text: '×', title: 'Cerrar', onclick: close })),
    content)
  document.body.append(pop)
  let generation = 0

  async function lookup (word, rect = null) {
    const own = ++generation
    input.value = String(word ?? '').trim()
    pop.hidden = false
    place(rect)
    content.replaceChildren(h('p', { text: 'Buscando en el diccionario local…' }))
    const entry = await provider.lookup(input.value, language.value)
    if (own !== generation) return
    if (!entry) {
      content.replaceChildren(h('p', { class: 'dictionary-empty', text: 'No hay una definición instalada para esta palabra.' }))
      return
    }
    content.replaceChildren(
      h('h3', { text: entry.lemma }),
      entry.pronunciation ? h('p', { class: 'dictionary-pronunciation', text: entry.pronunciation }) : null,
      h('p', { class: 'dictionary-pos', text: entry.partOfSpeech ?? '' }),
      h('ol', {}, (entry.definitions ?? []).map(definition => h('li', { text: definition }))),
      entry.forms?.length ? h('p', { class: 'dictionary-forms', text: `Formas: ${entry.forms.join(', ')}` }) : null)
    onRemember?.(entry, input.value)
  }

  function place (rect) {
    const left = rect ? Math.min(window.innerWidth - 340, Math.max(12, rect.left)) : (window.innerWidth - 320) / 2
    const top = rect ? Math.min(window.innerHeight - 280, Math.max(12, rect.bottom + 10)) : 80
    pop.style.left = `${left}px`
    pop.style.top = `${top}px`
  }

  function close () {
    generation++
    pop.hidden = true
    document.getElementById('stage')?.focus?.()
  }

  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') lookup(input.value)
    if (event.key === 'Escape') close()
  })
  language.value = preferredLanguage?.() ?? 'es'
  language.addEventListener('change', () => { if (input.value.trim()) lookup(input.value) })
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !pop.hidden) close()
  })

  return { element: pop, lookup, openManual: () => { lookup(''); input.focus() }, close, get isOpen () { return !pop.hidden } }
}
