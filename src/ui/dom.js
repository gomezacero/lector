// Ayudas minimas para construir DOM sin innerHTML.
// El texto de los libros viene de archivos ajenos: siempre textContent.

export function h (tag, props = {}, ...children) {
  const el = document.createElement(tag)

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

/** Botones de un grupo segmentado con uno activo. */
export function segmented (options, active, onPick) {
  return h('div', { class: 'seg' },
    options.map(option => h('button', {
      class: option.id === active ? 'is-on' : '',
      text: option.label,
      onclick: () => onPick(option.id)
    }))
  )
}

export const percent = value => `${Math.round(value * 100)}%`
