# SDD-06: accesibilidad, controles y restauración

**Estado:** Implementing

## Requisitos y UX

- **RX-A11Y-001:** movimiento `system | reduce | full`, con `system` respetando
  `prefers-reduced-motion`.
- **RX-A11Y-002:** tema de alto contraste, colores personalizados con aviso de
  contraste y escala UI de 100–200 %.
- **RX-A11Y-003:** ocultar por separado porcentaje y tiempo restante.
- **RX-A11Y-004:** todos los comandos funcionan por teclado; dispositivos que
  emulan teclado funcionan sin código especial y gamepad es optativo/mapeable.
- **RX-A11Y-005:** restaurar modo, presentación, panel y locator por libro;
  pantalla completa y escala se restauran globalmente.

## Contratos, errores y privacidad

Un registro de comandos es la única tabla de acciones. Las combinaciones
inválidas vuelven a valores predeterminados. El gamepad sólo se sondea al estar
habilitado. No se recopilan datos de dispositivos.

## Pruebas y aceptación

Recorrido sin ratón, foco visible, `aria-live`, panel sin trampa, media query de
movimiento y restauración tras cierre inmediato. Aceptado sin acciones
inalcanzables por teclado.
