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
  { id: 'Source Serif 4', label: 'Source Serif' },
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
  { id: 'sepia', label: 'Sepia' },
  { id: 'contrast', label: 'Alto contraste' },
  { id: 'custom', label: 'Personalizado' }
]

export const TYPOGRAPHY_PRESETS = Object.freeze({
  compact: { fontSize: 18, lineHeight: 1.5, columnWidth: 720, paragraphSpacing: 0.6, wordSpacing: 0, letterSpacing: 0, fontWeight: 400, verticalMargin: 32 },
  novel: { fontSize: 20, lineHeight: 1.75, columnWidth: 640, paragraphSpacing: 0.85, wordSpacing: 0, letterSpacing: 0, fontWeight: 400, verticalMargin: 48 },
  relaxed: { fontSize: 22, lineHeight: 1.9, columnWidth: 600, paragraphSpacing: 1.1, wordSpacing: 0.04, letterSpacing: 0.005, fontWeight: 400, verticalMargin: 64 },
  legible: { fontSize: 22, lineHeight: 1.9, columnWidth: 560, paragraphSpacing: 1.2, wordSpacing: 0.08, letterSpacing: 0.02, fontWeight: 500, verticalMargin: 72, textAlign: 'left' }
})

/** Ajustes que se guardan con el libro y no con la aplicacion. */
export const READING_KEYS = new Set(
  ['readingMode', 'presentationMode', 'typographyPreset', 'fontFamily', 'fontSize',
    'lineHeight', 'columnWidth', 'paragraphSpacing', 'wordSpacing', 'letterSpacing',
    'fontWeight', 'verticalMargin', 'textAlign', 'pageZoom', 'pageStop'])
READING_KEYS.add('lastPanel')

// Tocar cualquiera de estos cambia donde caen los saltos de linea.
const LAYOUT_KEYS = new Set(['fontFamily', 'fontSize', 'lineHeight', 'columnWidth',
  'paragraphSpacing', 'wordSpacing', 'letterSpacing', 'fontWeight', 'verticalMargin', 'textAlign'])
const TYPOGRAPHY_KEYS = new Set([...LAYOUT_KEYS])

export function createSettings (initial, { onLayoutChange, onChange, onBookChange } = {}) {
  let globals = { ...initial }
  let book = {} // ajustes del libro abierto, si hay alguno
  let saveTimer = null
  let pendingWrite = null

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
    style.setProperty('--read-paragraph', `${current.paragraphSpacing ?? 0.85}em`)
    style.setProperty('--read-word-spacing', `${current.wordSpacing ?? 0}em`)
    style.setProperty('--read-letter-spacing', `${current.letterSpacing ?? 0}em`)
    style.setProperty('--read-weight', String(current.fontWeight ?? 400))
    style.setProperty('--read-vmargin', `${current.verticalMargin ?? 48}px`)
    style.setProperty('--ui-scale', `${(current.uiScale ?? 100) / 100}`)
    root.dataset.motion = current.motion ?? 'system'
    if (current.theme === 'custom') {
      for (const [css, value] of [
        ['--bg', current.customBackground], ['--surface', current.customBackground],
        ['--surface-raised', current.customBackground], ['--fg', current.customForeground],
        ['--read-fg', current.customForeground], ['--accent', current.customAccent]
      ]) {
        if (/^#[0-9a-f]{6}$/i.test(value ?? '')) style.setProperty(css, value)
        else style.removeProperty(css)
      }
    } else {
      for (const css of ['--bg', '--surface', '--surface-raised', '--fg', '--read-fg', '--accent']) {
        style.removeProperty(css)
      }
    }
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
    saveTimer = setTimeout(writeGlobals, 400)
  }

  function writeGlobals () {
    clearTimeout(saveTimer)
    saveTimer = null
    const snapshot = { ...globals }
    const run = pendingWrite
      ? pendingWrite.catch(() => {}).then(() => window.lector.settings.write(snapshot))
      : Promise.resolve(window.lector.settings.write(snapshot))
    const settled = run.finally(() => {
      if (pendingWrite === settled) pendingWrite = null
    })
    settled.catch(err => window.lector.log?.error?.(`ajustes: ${err.message}`))
    pendingWrite = settled
    return settled
  }

  function update (patch) {
    const before = effective()

    // Cualquier ajuste manual separa el libro del preset que lo creo.
    if (!Object.hasOwn(patch, 'typographyPreset') &&
        Object.keys(patch).some(key => TYPOGRAPHY_KEYS.has(key)) && onBookChange) {
      patch = { ...patch, typographyPreset: 'custom' }
    }

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
    async flush () {
      if (saveTimer) await writeGlobals()
      if (pendingWrite) await pendingWrite
    },

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
