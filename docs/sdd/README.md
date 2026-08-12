# Desarrollo dirigido por especificaciones

Este directorio es la fuente de verdad de la evolución de la experiencia de
lectura. `experiencia-lectura.md` ordena las entregas y `specs/` define el
comportamiento observable. La arquitectura general sigue en `../architecture.md`.

## Flujo

Cada especificación pasa por `Ready`, `Implementing`, `Verified` y `Released`.
Una capacidad sólo puede marcarse `Verified` cuando todos sus requisitos tienen
una prueba o evidencia enlazada y pasan `npm run verify`. `Released` significa
que su bandera local está activa en la distribución; no existe configuración
remota.

## Regla de trazabilidad

Los requisitos usan `RX-<spec>-<número>`, por ejemplo `RX-SRCH-001`. Los tests
incluyen el identificador en el nombre o comentario. La tabla maestra se mantiene
en `experiencia-lectura.md`; el detalle de aceptación vive en cada spec.

## Plantilla obligatoria

Toda spec contiene: contexto y objetivo, requisitos, flujo UX, contratos y
datos, errores, accesibilidad y privacidad, pruebas, rendimiento y aceptación.
Cambiar un requisito después de comenzar exige actualizar antes la spec y, si
cambia un límite estable, registrar un ADR.

