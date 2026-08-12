# SDD-01: búsqueda y regreso

**Estado:** Verified

## Contexto y objetivo

Consultar un nombre o una nota no debe destruir la posición espacial. La
búsqueda trabaja sobre los bloques normalizados y todos sus resultados son
`ReadingLocator`.

## Requisitos y UX

- **RX-SRCH-001:** `Ctrl/Cmd+F` abre un panel con entrada enfocada; `Escape` lo
  cierra y devuelve el foco al lector sin moverlo.
- **RX-SRCH-002:** consultas de 2 a 256 caracteres ignoran mayúsculas y
  diacríticos, conservan offsets originales y devuelven como máximo 200
  resultados con contexto, capítulo, página y porcentaje.
- **RX-SRCH-003:** activar un resultado guarda el locator previo y navega con
  `goToLocator`; búsquedas encadenadas conservan una pila LIFO de 20 entradas.
- **RX-SRCH-004:** notas y capítulos usan la misma pila. “Volver” y `Alt+Left`
  consumen una entrada; lectura normal y scrubber no añaden entradas.
- **RX-SRCH-005:** cambiar de libro cancela el índice y descarta resultados
  tardíos. La consulta nunca se persiste.
- **RX-SRCH-006:** el botón Limpiar vacía consulta y resultados sin cerrar el
  panel. Cerrar, cambiar a Notas/Ajustes o pulsar `Escape` oculta completamente
  la búsqueda y devuelve el foco sin alterar el locator.

## Contratos, errores y privacidad

`SearchResult` contiene `locator`, `end`, `context`, `chapter`, `page` y
`percent`. `BookSearchIndex.search(query, limit)` es local y cancelable. Una
consulta corta produce estado vacío, no error. Todo texto se inserta con
`textContent` y jamás sale del renderer.

## Pruebas, rendimiento y aceptación

Cubrir Unicode, diacríticos con mapeo de offsets, límite de resultados, cero
resultados, pila llena y cambio rápido de libro. En el fixture de un millón de
caracteres una consulta caliente debe tardar menos de 100 ms. Aceptado cuando
buscar, saltar dos veces y volver dos veces restaura los locators exactos.
