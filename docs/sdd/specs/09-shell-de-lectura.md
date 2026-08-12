# SDD-09: shell y superficies de lectura

**Estado:** Verified

## Contexto y objetivo

Las herramientas deben acompañar la novela sin competir con ella. La barra de
opciones, el paginador y los paneles comparten un único estado visual; ninguna
superficie oculta puede interceptar clics, conservar foco ni reaparecer por un
estado persistido incorrecto.

## Requisitos y UX

- **RX-SHELL-001:** el HUD agrupa ubicación, navegación y herramientas en una
  superficie flotante legible. El modo actual, las herramientas activas y la
  posición se distinguen sin depender sólo del color.
- **RX-SHELL-002:** Buscar, Notas y Ajustes comparten un único panel lateral.
  Abrir uno cierra y oculta los demás; pulsar otra vez la herramienta activa,
  su botón Cerrar o `Escape` devuelve todo el ancho y foco a la lectura.
- **RX-SHELL-003:** Ajustes distribuye las opciones en secciones plegables de
  Lectura, Tipografía, Enfoque, Apariencia, Voz, Accesibilidad, Comodidad,
  Controles y Documento, conservando el estado expandido durante la sesión.
- **RX-SHELL-004:** Marcar es una acción reversible sobre la unidad actual. El
  botón cambia a “Quitar marca”, mantiene `aria-pressed` sincronizado y nunca
  elimina un resaltado que coincida en offset o bloque.
- **RX-SHELL-005:** el paginador lateral muestra avance y capítulos, amplía su
  zona sensible, describe el destino antes de saltar y funciona con flechas,
  RePág/AvPág, Inicio y Fin.
- **RX-SHELL-006:** a menos de 820 px el panel usa la superficie disponible y
  el HUD reduce información secundaria sin perder herramientas desplazables.

## Contratos y estado

`AppShellController.showPanel()` devuelve el panel efectivo y expone
`activePanel`; ese resultado es el único valor que puede persistirse en
`lastPanel`. `NotesStore.findBookmark()` excluye notas `kind: highlight` y
acepta offset o ubicación de bloque/carácter. El scrubber continúa navegando
con offsets absolutos y no añade puntos a la pila de regreso.

## Errores, accesibilidad y privacidad

Los paneles cerrados usan `hidden` e `inert`, y desenfocan editores antes de
ocultarse. Los botones Cerrar tienen nombre accesible, los grupos del HUD tienen
etiquetas y el paginador publica `aria-valuenow` y `aria-valuetext`. No se
añaden datos persistidos, telemetría ni acceso de red.

## Pruebas, rendimiento y aceptación

- `test/appShell.test.js`: exclusividad y alternancia de paneles.
- `test/notesStore.test.js`: marcador y resaltado con el mismo offset/instante.
- `npm run e2e:read`: Buscar → Notas → Cerrar, Marcar → Quitar → Marcar,
  ajustes, scrubber, notas y reapertura.
- Inspección de `test/screenshots/02-leyendo.png`, `03-ajustes.png`,
  `04-notas.png` y `08-busqueda.png` a 1167 × 824 CSS px.

Aceptado cuando sólo existe un `.panel:not([hidden])`, la X deja cero paneles
visibles, la marca se puede quitar desde la misma línea, el locator no cambia
al abrir o cerrar herramientas y la navegación existente no supera 10 % de
regresión.
