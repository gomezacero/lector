# SDD-08: validación con lectores

**Estado:** Implementing · **Distribución:** sólo desarrollo

El modo local, cuatro condiciones, métricas y exportación están implementados;
la ejecución con la muestra humana es deliberadamente una puerta posterior.

## Requisitos

- **RX-STUDY-001:** comparar texto completo, guía de línea, guía de frase y
  página refluida con orden latino contrabalanceado.
- **RX-STUDY-002:** registrar localmente comprensión, cansancio, pérdida de
  lugar, retrocesos, duración voluntaria y preferencia, sin identificadores ni
  texto personal.
- **RX-STUDY-003:** exportar JSON explícitamente y documentar consentimiento,
  instrucciones y análisis para una muestra inicial mínima de 16 lectores.
- **RX-STUDY-004:** la página sale de beta sólo si no degrada comprensión más
  de 10 %, no aumenta pérdida de lugar y mejora preferencia o confort.

## UX, privacidad y aceptación

El modo se activa sólo mediante tarea de desarrollo y usa fixtures del corpus,
no la biblioteca personal. No hay envío automático. Aceptado cuando una sesión
completa produce un JSON validado y reproducible y el informe calcula los tres
criterios de graduación.
