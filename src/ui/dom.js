// Ayudas minimas para construir DOM sin innerHTML.
// El texto de los libros viene de archivos ajenos: siempre textContent.

// Los elementos de SVG viven en otro espacio de nombres: creados con
// createElement se insertan pero no dibujan nada.
const SVG_TAGS = new Set(['svg', 'path', 'circle', 'rect', 'line', 'g', 'polyline'])
const SVG_NS = 'http://www.w3.org/2000/svg'

export function h (tag, props = {}, ...children) {
  const el = SVG_TAGS.has(tag)
    ? document.createElementNS(SVG_NS, tag)
    : document.createElement(tag)

  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue

    if (key === 'class') el.className = value
    else if (key === 'text') el.textContent = value
    else if (key === 'dataset') Object.assign(el.dataset, value)
    // setProperty y no Object.assign: las variables CSS (--algo) se ignoran
    // en silencio al asignarlas como propiedad del objeto style.
    else if (key === 'style') {
      for (const [prop, val] of Object.entries(value)) el.style.setProperty(prop, val)
    }
    else if (key.startsWith('on')) el.addEventListener(key.slice(2).toLowerCase(), value)
    else el.setAttribute(key, value === true ? '' : String(value))
  }

  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue
    el.append(child)
  }
  return el
}

/**
 * Botones de un grupo segmentado con uno activo. Semantica de radiogroup:
 * la clase is-on solo pinta, y un lector de pantalla necesita saber cual
 * esta elegido y de que va el grupo.
 */
export function segmented (options, active, onPick, label) {
  return h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label },
    options.map(option => h('button', {
      class: option.id === active ? 'is-on' : '',
      role: 'radio',
      'aria-checked': option.id === active ? 'true' : 'false',
      text: option.label,
      onclick: () => onPick(option.id)
    }))
  )
}

export const percent = value => `${Math.round(value * 100)}%`
