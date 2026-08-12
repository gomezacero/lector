// Estado puramente visual de la aplicacion: vista, panel lateral y reposo del
// HUD. No conoce libros, almacenamiento ni procesamiento.

/** @typedef {{open:()=>void,close:()=>void,isOpen:boolean}} Panel */

/** @param {{body:HTMLElement,hud:HTMLElement,chapterMenu:HTMLElement,idleMs?:number}} options */
export function createAppShellController ({ body, hud, chapterMenu, idleMs = 2200 }) {
  /** @type {Panel|null} */
  let settingsPanel = null
  /** @type {Panel|null} */
  let notesView = null
  /** @type {Panel|null} */
  let searchView = null
  /** @type {ReturnType<typeof setTimeout>|null} */
  let hudTimer = null
  /** @type {'settings'|'notes'|'search'|null} */
  let activePanel = null

  /** @param {Panel} nextSettings @param {Panel} nextNotes @param {Panel=} nextSearch */
  function registerPanels (nextSettings, nextNotes, nextSearch) {
    settingsPanel = nextSettings
    notesView = nextNotes
    searchView = nextSearch ?? null
  }

  /** @param {'library'|'sheet'|'reader'} view */
  function showView (view) {
    body.dataset.view = view
  }

  /** @param {'settings'|'notes'|'search'} which */
  function panelIsOpen (which) {
    return activePanel === which
  }

  /** @param {'settings'|'notes'|'search'|null} which */
  function showPanel (which) {
    // Una sola fuente de verdad: volver a pulsar la herramienta activa la
    // cierra; elegir otra desmonta la anterior antes de abrir la nueva. Los
    // paneles ya no pueden quedar apilados ni interceptar el boton Cerrar.
    const target = which && activePanel !== which ? which : null
    settingsPanel?.[target === 'settings' ? 'open' : 'close']()
    notesView?.[target === 'notes' ? 'open' : 'close']()
    searchView?.[target === 'search' ? 'open' : 'close']()
    activePanel = target
    body.classList.toggle('has-panel', target !== null)
    if (target) body.dataset.panel = target
    else delete body.dataset.panel
    if (target) wakeHud()
    return target
  }

  function wakeHud () {
    hud.classList.remove('is-idle')
    if (hudTimer) clearTimeout(hudTimer)
    hudTimer = setTimeout(() => {
      if (chapterMenu.hidden) hud.classList.add('is-idle')
    }, idleMs)
  }

  function destroy () {
    if (hudTimer) clearTimeout(hudTimer)
  }

  return {
    registerPanels, showView, showPanel, panelIsOpen, wakeHud, destroy,
    get activePanel () { return activePanel }
  }
}
