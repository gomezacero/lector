// El efecto de lectura: una banda nitida sobre un fondo difuminado.
//
// Las dos capas comparten layout, asi que basta con recortar la de arriba a la
// altura de la linea activa. El recorte es un degradado (no un corte seco) para
// que las lineas vecinas se insinuen en vez de desaparecer de golpe.
//
// El texto se desplaza solo cuando la linea activa saldria de la zona comoda,
// no en cada movimiento: leer no deberia mover la pagina bajo los ojos.

// Altura en pantalla donde se sostiene la linea activa. Un poco por encima del
// centro, que es donde cae la mirada de forma natural al leer.
const ANCHOR = 0.4

export function createFocusController ({ stage, sharpLayer }) {
  let lines = []
  let index = 0
  let settings = { focusLines: 1, falloffLines: 1.6 }
  let contentY = 0
  let presentation = 'continuous'
  let pageStarts = [0]

  function setLines (next) {
    lines = next
    index = Math.min(index, Math.max(0, lines.length - 1))
    measurePages()
  }

  function setSettings (next) {
    settings = { ...settings, ...next }
    measurePages()
  }

  function setPresentation (next) {
    presentation = next === 'paged' ? 'paged' : 'continuous'
    measurePages()
  }

  function verticalMargin () {
    return Math.max(24, Math.min(stage.clientHeight * 0.25, settings.verticalMargin ?? 48))
  }

  /** Limites estables derivados de las unidades ya medidas. */
  function measurePages () {
    pageStarts = [0]
    if (!lines.length || presentation !== 'paged') return
    const available = Math.max(80, stage.clientHeight - verticalMargin() * 2)
    let pageTop = lines[0].top
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].bottom - pageTop <= available) continue
      // Si dos frases comparten renglon, nunca se corta entre ellas.
      if (lines[i].top === lines[i - 1].top) continue
      pageStarts.push(i)
      pageTop = lines[i].top
    }
  }

  function pageFor (lineIndex) {
    let found = 0
    for (let i = 1; i < pageStarts.length; i++) {
      if (pageStarts[i] > lineIndex) break
      found = i
    }
    return found
  }

  /** Alto de la banda nitida: la linea activa mas las que pida el ajuste. */
  function band () {
    const first = lines[index]
    if (!first) return null
    const lastIndex = Math.min(lines.length - 1, index + Math.max(1, settings.focusLines) - 1)
    return { top: first.top, bottom: lines[lastIndex].bottom }
  }

  function lineHeight () {
    const line = lines[index]
    return line ? Math.max(12, line.bottom - line.top) : 24
  }

  /**
   * Deja la linea en su sitio y coloca la banda encima.
   * @param {number} next indice de linea
   * @param {{animate?:boolean}} options
   */
  function moveTo (next, { animate = true } = {}) {
    if (!lines.length) return
    index = Math.max(0, Math.min(next, lines.length - 1))

    const target = band()
    if (!target) return

    const stageHeight = stage.clientHeight
    const anchor = stageHeight * ANCHOR

    // Nunca se empuja el contenido hacia abajo: el padding superior de la
    // pagina ya deja sitio para que la primera linea caiga en el ancla.
    if (presentation === 'paged') {
      const first = pageStarts[pageFor(index)] ?? 0
      contentY = verticalMargin() - (lines[first]?.top ?? 0)
    } else {
      contentY = Math.min(0, anchor - target.top)
    }

    const screenTop = target.top + contentY
    const screenBottom = target.bottom + contentY
    const pad = lineHeight() * 0.16
    const feather = Math.max(6, lineHeight() * settings.falloffLines)

    apply({
      contentY,
      a: screenTop - pad - feather,
      b: screenTop - pad,
      c: screenBottom + pad,
      d: screenBottom + pad + feather
    }, animate)
  }

  function apply (values, animate) {
    if (!animate) stage.classList.add('is-instant')

    stage.style.setProperty('--content-y', `${values.contentY.toFixed(2)}px`)
    sharpLayer.style.setProperty('--mask-a', `${values.a.toFixed(2)}px`)
    sharpLayer.style.setProperty('--mask-b', `${values.b.toFixed(2)}px`)
    sharpLayer.style.setProperty('--mask-c', `${values.c.toFixed(2)}px`)
    sharpLayer.style.setProperty('--mask-d', `${values.d.toFixed(2)}px`)

    if (!animate) {
      // Forzar el recalculo antes de devolver las transiciones, o el salto se
      // animaria igualmente en el siguiente frame.
      void stage.offsetHeight
      stage.classList.remove('is-instant')
    }
  }

  return {
    setLines,
    setSettings,
    setPresentation,
    moveTo,
    refresh: () => moveTo(index, { animate: false }),
    get index () { return index },
    get lineCount () { return lines.length },
    get lines () { return lines },
    get contentOffset () { return contentY },
    get presentation () { return presentation },
    get pageIndex () { return pageFor(index) },
    get pageCount () { return pageStarts.length },
    movePage (direction) {
      const page = pageFor(index)
      if (direction > 0) return pageStarts[Math.min(page + 1, pageStarts.length - 1)]
      return pageStarts[Math.max(0, page - 1)]
    },
    /** Cuantas lineas caben en pantalla: lo que avanza una pagina. */
    linesPerScreen () {
      if (presentation === 'paged') {
        const page = pageFor(index)
        const start = pageStarts[page]
        const end = pageStarts[page + 1] ?? lines.length
        return Math.max(1, end - start)
      }
      return Math.max(1, Math.floor(stage.clientHeight / lineHeight()) - 2)
    },
    /** Indice de la primera linea de un bloque, para saltar a una nota. */
    lineOfBlock (blockIndex, charOffset = 0) {
      let best = -1
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].block !== blockIndex) continue
        if (best === -1 || lines[i].start <= charOffset) best = i
        if (lines[i].start > charOffset) break
      }
      return best === -1 ? 0 : best
    }
  }
}
