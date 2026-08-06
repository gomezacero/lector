// Preferencias de lectura: estado, persistencia y su traduccion a CSS.
//
// Hay dos ambitos. Los ajustes de lectura —modo, cuerpo, interlineado, ancho,
// ampliacion— dependen de como este compuesto el documento y se guardan con
// cada libro: una novela pide letra grande y un articulo pide ampliacion, y si
// fueran comunes se pisarian entre si. Los demas son gusto del lector y valen
// para toda la aplicacion.
//
// Regla unica: los efectivos son los globales con encima los del libro. Los
// globales hacen ademas de punto de partida para cualquier libro nuevo.
//
// Se distingue tambien entre ajustes que solo repintan (tema, desenfoque) y
// ajustes que cambian el maquetado (cuerpo, ancho), porque los segundos obligan
// a volver a medir las lineas.

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

/** Ajustes que se guardan con el libro y no con la aplicacion. */
export const READING_KEYS = new Set(
  ['readingMode', 'fontSize', 'lineHeight', 'columnWidth', 'pageZoom'])

// Tocar cualquiera de estos cambia donde caen los saltos de linea.
const LAYOUT_KEYS = new Set(['fontFamily', 'fontSize', 'lineHeight', 'columnWidth', 'textAlign'])

export function createSettings (initial, { onLayoutChange, onChange, onBookChange } = {}) {
  let globals = { ...initial }
  let book = {} // ajustes del libro abierto, si hay alguno
  let saveTimer = null

  const effective = () => ({ ...globals, ...book })

  function apply () {
    const current = effective()
    const root = document.body
    root.dataset.theme = current.theme

    const style = root.style
    style.setProperty('--read-font', `'${current.fontFamily}'`)
    style.setProperty('--read-size', `${current.fontSize}px`)
    style.setProperty('--read-leading', String(current.lineHeight))
    style.setProperty('--read-width', `${current.columnWidth}px`)
    style.setProperty('--read-align', current.textAlign)
    // Con la guia apagada, la capa de fondo queda igual que la nitida y el
    // efecto desaparece: se lee el texto entero, sin tocar nada mas.
    const guided = current.focusEnabled !== false
    style.setProperty('--blur', `${guided ? current.blurAmount : 0}px`)
    style.setProperty('--dim', String(guided ? current.dimOpacity : 1))
  }

  // Arrastrar un deslizador dispara decenas de cambios por segundo: se aplican
  // todos en pantalla, pero al disco se baja una sola vez al soltar.
  function persist () {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => window.lector.settings.write(globals), 400)
  }

  function update (patch) {
    const before = effective()

    for (const [key, value] of Object.entries(patch)) {
      // Los de lectura van al libro abierto; si no hay ninguno, al global, que
      // es lo que heredaran los libros nuevos.
      if (READING_KEYS.has(key) && onBookChange) book[key] = value
      else globals[key] = value
    }

    const current = effective()
    const affectsLayout = Object.keys(patch)
      .some(key => LAYOUT_KEYS.has(key) && current[key] !== before[key])

    apply()
    onChange?.(current)
    if (affectsLayout) onLayoutChange?.(current)

    if (Object.keys(patch).some(key => READING_KEYS.has(key)) && onBookChange) {
      onBookChange({ ...book })
    }
    persist()
  }

  apply()

  return {
    get all () { return effective() },
    get globals () { return { ...globals } },
    get bookSettings () { return { ...book } },
    get: key => effective()[key],
    update,

    /**
     * Carga los ajustes del libro que se abre. Sin argumento vuelve a dejar
     * solo los globales, que es lo que hay en la biblioteca.
     */
    useBook (settingsOfBook) {
      book = { ...settingsOfBook }
      apply()
      return effective()
    }
  }
}
