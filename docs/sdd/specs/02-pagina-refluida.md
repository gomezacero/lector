# SDD-02: página refluida estable

**Estado:** Implementing · **Liberación:** beta optativa

## Contexto y objetivo

Ofrecer una pantalla espacialmente estable sin confundirla con la página
original del PDF. `presentationMode` es independiente de `readingMode`.

## Requisitos y UX

- **RX-PAGE-001:** `continuous | paged` se guarda por libro y sólo afecta los
  modos de flujo y frase.
- **RX-PAGE-002:** cada página se deriva de renglones medidos por el navegador;
  un párrafo largo puede partirse, con `orphans/widows: 2`, y un título conserva
  al menos dos renglones posteriores cuando sea posible.
- **RX-PAGE-003:** la guía se mueve dentro de la página; cruzar su límite cambia
  la pantalla. `PageUp/PageDown` navegan límites reversibles.
- **RX-PAGE-004:** resize o tipografía invalidan la caché en memoria y reubican
  el locator exacto sin guardar números de página refluida.
- **RX-PAGE-005:** se muestra “Página refluida — Beta”, queda desactivada por
  defecto y no anima con movimiento reducido.

## Contratos, errores y privacidad

El lector expone `setPresentation` y emite `layout`. La clave de caché combina
capítulo, viewport y ajustes de layout. Si no puede medir, cae a continuo y
anuncia el error sin alterar la preferencia ni el progreso.

## Pruebas, rendimiento y aceptación

Cubrir párrafo mayor que viewport, título al final, figuras, resize repetido y
avance/retroceso. El modo continuo no puede empeorar más de 10 %. Aceptado si
locator y extracto son idénticos antes y después de relayout y el paginado es
reversible.
