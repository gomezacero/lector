// Preferencias de lectura: estado, persistencia y su traduccion a CSS.
//
// Se distingue entre ajustes que solo repintan (tema, blur) y ajustes que
// cambian el maquetado (fuente, cuerpo, ancho). Los segundos obligan a volver a
// medir las lineas, asi que se avisa aparte.

export const FONTS = [
  { id: 'Sitka Text', label: 'Sitka' },
  { id: 'Georgia', label: 'Georgia' },
  { id: 'Cambria', label: 'Cambria' },
  { id: 'Constantia', label: 'Constantia' },
  { id: 'Palatino Linotype', label: 'Palatino' },
  { id: 'Segoe UI Variable Text', label: 'Segoe' }
]

export const THEMES = [
  { id: 'dark', label: 'Oscuro' },
  { id: 'light', label: 'Claro' },
  { id: 'sepia', label: 'Sepia' }
]

// Tocar cualquiera de estos cambia donde caen los saltos de linea.
const LAYOUT_KEYS = new Set(['fontFamily', 'fontSize', 'lineHeight', 'columnWidth', 'textAlign'])

export function createSettings (initial, { onLayoutChange, onChange } = {}) {
  let current = { ...initial }
  let saveTimer = null

  // Arrastrar un deslizador dispara decenas de cambios por segundo: se aplican
  // todos en pantalla, pero al disco se baja una sola vez al soltar.
  function persist () {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => window.lector.settings.write(current), 400)
  }

  function apply () {
    const root = document.body
    root.dataset.theme = current.theme

    const style = root.style
    style.setProperty('--read-font', `'${current.fontFamily}'`)
    style.setProperty('--read-size', `${current.fontSize}px`)
    style.setProperty('--read-leading', String(current.lineHeight))
    style.setProperty('--read-width', `${current.columnWidth}px`)
    style.setProperty('--read-align', current.textAlign)
    style.setProperty('--blur', `${current.blurAmount}px`)
    style.setProperty('--dim', String(current.dimOpacity))
  }

  function update (patch) {
    const affectsLayout = Object.keys(patch).some(key => LAYOUT_KEYS.has(key) && patch[key] !== current[key])
    current = { ...current, ...patch }
    apply()
    onChange?.(current)
    if (affectsLayout) onLayoutChange?.(current)
    persist()
  }

  apply()

  return {
    get all () { return { ...current } },
    get: key => current[key],
    update
  }
}
