// La estanteria: lo que se ve al abrir la aplicacion.
//
// Casi siempre se entra aqui para seguir con lo que se estaba leyendo, asi que
// ese libro ocupa una franja propia arriba y se retoma de un clic. Debajo, el
// resto de la biblioteca con sus portadas, que es lo unico que distingue de un
// vistazo un libro de otro.

import { h, percent } from '../ui/dom.js'
import { MODES } from '../reader/mode.js'

const ORDERS = [
  { id: 'recent', label: 'Recientes', compare: (a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0) },
  { id: 'title', label: 'Título', compare: (a, b) => a.title.localeCompare(b.title, 'es') },
  { id: 'progress', label: 'Progreso', compare: (a, b) => progressOf(b) - progressOf(a) }
]

const progressOf = entry => entry.progress?.percent ?? 0
const coverUrl = entry => `app://lector/covers/${entry.id}.jpg`

/** "hoy", "ayer", "hace 3 días": mas legible que una fecha completa. */
function whenRead (timestamp) {
  if (!timestamp) return 'sin abrir'
  const days = Math.floor((Date.now() - timestamp) / 86_400_000)
  if (days <= 0) return 'hoy'
  if (days === 1) return 'ayer'
  if (days < 7) return `hace ${days} días`
  if (days < 30) return `hace ${Math.floor(days / 7)} semanas`
  return `hace ${Math.floor(days / 30)} meses`
}

export function createLibraryView ({ grid, empty, onOpen, onRemove, onSheet }) {
  let order = 'recent'
  let entries = []

  /** Portada, con las iniciales de reserva mientras se dibuja o si falla. */
  function cover (entry, className) {
    const image = h('img', {
      class: 'cover-image',
      alt: '',
      loading: 'lazy',
      src: coverUrl(entry),
      // Un libro recien anadido puede no tener portada todavia.
      onerror: event => { event.target.style.display = 'none' }
    })

    return h('div', { class: className },
      h('span', { class: 'cover-fallback', text: entry.title.slice(0, 2).toUpperCase() }),
      image
    )
  }

  const bar = value => h('div', { class: 'progress-bar' },
    h('i', { style: { '--p': String(value) } }))

  /** El boton de borrar, igual en la franja y en las tarjetas. */
  const removeButton = entry => h('button', {
    class: 'book-remove',
    title: `Borrar «${entry.title}»`,
    onclick: event => { event.stopPropagation(); onRemove(entry) }
  }, crossIcon())

  /** Franja de arriba: el libro que se estaba leyendo. */
  function resumeCard (entry) {
    const read = progressOf(entry)

    return h('section', { class: 'resume' },
      // La franja se queda siempre con el ultimo libro abierto, y sin este
      // boton ese libro —justo el que mas apetece quitar— era el unico de la
      // biblioteca que no se podia borrar.
      removeButton(entry),

      h('button', {
        class: 'resume-cover',
        title: `Seguir leyendo «${entry.title}»`,
        onclick: () => onOpen(entry)
      }, cover(entry, 'cover cover-lg')),

      h('div', { class: 'resume-info' },
        h('p', { class: 'resume-eyebrow', text: read > 0 ? 'Seguías por aquí' : 'Sin empezar' }),
        h('h2', { class: 'resume-title', text: entry.title }),
        entry.author ? h('p', { class: 'resume-author', text: entry.author }) : null,

        h('div', { class: 'resume-progress' },
          bar(read),
          h('span', { class: 'resume-percent', text: percent(read) })
        ),

        h('p', { class: 'resume-meta', text:
          [`${entry.pageCount} páginas`,
            entry.scanned ? 'escaneado' : null,
            entry.readingMode ? MODES[entry.readingMode]?.label.toLowerCase() : null,
            whenRead(entry.lastOpenedAt)].filter(Boolean).join(' · ') }),

        h('button', {
          class: 'btn btn-primary resume-go',
          text: read > 0 ? 'Seguir leyendo' : 'Empezar a leer',
          onclick: () => onOpen(entry)
        })
      )
    )
  }

  function card (entry) {
    const read = progressOf(entry)

    return h('div', {
      class: 'book',
      role: 'button',
      tabindex: '0',
      title: entry.path,
      onclick: () => onOpen(entry),
      onkeydown: event => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        onOpen(entry)
      }
    },
    h('div', { class: 'book-cover' },
      cover(entry, 'cover'),
      bar(read),
      removeButton(entry)
    ),

    h('p', { class: 'book-title', text: entry.title }),
    h('p', { class: 'book-meta' },
      h('span', {
        class: entry.missing ? 'is-missing' : '',
        text: entry.missing ? 'archivo no encontrado' : (read > 0 ? `${percent(read)} · ` : '')
      }),
      h('span', { text: whenRead(entry.lastOpenedAt) }),
      // Que el escaneado se distinga en la estanteria: se hojea igual, pero
      // explica por que este libro no ofrece la lectura linea a linea.
      entry.scanned ? h('span', { text: ' · escaneado' }) : null
    ),

    entry.readingMode
      ? h('button', {
          class: 'book-mode',
          title: 'Cambiar cómo se lee este libro',
          text: MODES[entry.readingMode]?.label ?? '',
          onclick: event => { event.stopPropagation(); onSheet(entry) }
        })
      : null
    )
  }

  function paint () {
    if (!entries.length) {
      grid.replaceChildren()
      empty.hidden = false
      return
    }
    empty.hidden = true

    const sorted = [...entries].sort(ORDERS.find(o => o.id === order).compare)
    // Solo se destaca un libro empezado: si no hay ninguno, la franja sobra.
    const resume = [...entries]
      .filter(e => e.lastOpenedAt && !e.missing)
      .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)[0]

    const rest = resume ? sorted.filter(e => e.id !== resume.id) : sorted

    grid.replaceChildren(...[
      resume ? resumeCard(resume) : null,

      rest.length
        ? h('div', { class: 'shelf-head' },
            h('h2', { class: 'shelf-title', text: resume ? 'Tus libros' : 'Biblioteca' }),
            h('div', { class: 'shelf-order' },
              ...ORDERS.map(option => h('button', {
                class: option.id === order ? 'is-on' : '',
                text: option.label,
                onclick: () => { order = option.id; paint() }
              })))
          )
        : null,

      rest.length ? h('div', { class: 'shelf' }, rest.map(card)) : null
    ].filter(Boolean))
  }

  return {
    render (next) {
      entries = next
      paint()
    }
  }
}

/** Icono dibujado: una equis de fuente no casa con ningun sistema de iconos. */
const crossIcon = () => h('svg', {
  viewBox: '0 0 16 16', width: '14', height: '14', 'aria-hidden': 'true'
}, h('path', {
  d: 'M4 4l8 8M12 4l-8 8',
  stroke: 'currentColor',
  'stroke-width': '1.6',
  'stroke-linecap': 'round',
  fill: 'none'
}))
