# ADR 0004: banderas y métricas exclusivamente locales

## Estado

Aceptada.

## Decisión

Las capacidades en desarrollo se controlan mediante constantes y preferencias
locales. No se usa un servicio de flags. Descansos, vocabulario, estadísticas y
estudio requieren activación explícita; el estudio sólo existe en tareas de
desarrollo y exporta manualmente.

## Consecuencias

La aplicación no incorpora telemetría ni configuración remota. Diagnóstico y
estudio producen archivos sólo cuando el usuario lo solicita.

