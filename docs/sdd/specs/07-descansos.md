# SDD-07: descansos y estadísticas locales

**Estado:** Verified · **Preferencia predeterminada:** desactivada

## Requisitos y UX

- **RX-BREAK-001:** intervalos `off | 20 | 30 | 40` minutos de actividad real;
  ventana oculta, panel modal o 90 segundos sin interacción no cuentan.
- **RX-BREAK-002:** al vencer, esperar al siguiente final de unidad y ofrecer
  posponer, pausa visual de 20 segundos, pausa de 5 minutos o desactivar.
- **RX-BREAK-003:** estadísticas separadas y optativas guardan únicamente
  minutos activos, sesiones y pausas; no hay rachas, objetivos ni puntuaciones.
- **RX-BREAK-004:** desactivar estadísticas impide toda escritura y permite
  borrar lo existente.

## Pruebas y aceptación

Reloj inyectable para foco, inactividad, cambio de libro y final de frase.
Aceptado si nunca interrumpe una unidad y no existe archivo de estadísticas sin
consentimiento.
