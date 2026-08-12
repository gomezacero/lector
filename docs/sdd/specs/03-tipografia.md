# SDD-03: tipografía avanzada y presets

**Estado:** Verified

## Requisitos y UX

- **RX-TYPE-001:** controlar separación de párrafos, palabras y caracteres,
  peso y márgenes verticales además de los controles actuales.
- **RX-TYPE-002:** ofrecer `compact`, `novel`, `relaxed` y `legible`; aplicar un
  preset escribe sus valores por libro y un cambio posterior marca `custom`.
- **RX-TYPE-003:** los globales son semilla de libros nuevos. Un libro existente
  sin campos nuevos conserva la apariencia actual.
- **RX-TYPE-004:** la alineación izquierda y un ancho aproximado de 80
  caracteres se recomiendan, pero no se imponen.
- **RX-TYPE-005:** ningún texto atribuye efectos médicos o una ventaja universal
  a una fuente para dislexia.

## Datos, errores y accesibilidad

Los valores se validan dentro de los rangos visibles y se aplican como variables
CSS. Todos los controles tienen `label`, valor anunciado y teclado. Un valor
viejo fuera de rango se limita en UI sin reescribirlo hasta que el usuario
guarde.

## Pruebas y aceptación

Probar resolución global/libro, presets, `custom`, relayout y cierre antes del
debounce. Aceptado cuando cada valor sobrevive a reabrir y el locator no cambia.
