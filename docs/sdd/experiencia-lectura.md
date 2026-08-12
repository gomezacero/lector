# SDD maestro: experiencia de lectura

## Resultado

Lector prioriza continuidad, orientación y confort en novelas sin abandonar su
promesa local. `Book v11` amplía v10 sin mover texto ni offsets, y
`ReadingLocator.offset` continúa siendo el ancla canónica para búsqueda, voz,
diccionario, presentación y progreso.

## Orden y dependencias

| Orden | Spec | Estado | Depende de | Bandera al verificar |
|---:|---|---|---|---|
| 1 | [Búsqueda y regreso](specs/01-busqueda-y-regreso.md) | Verified | contratos de sesión | activa |
| 2 | [Página refluida](specs/02-pagina-refluida.md) | Implementing | eventos de lector | beta optativa |
| 3 | [Tipografía](specs/03-tipografia.md) | Verified | ajustes por libro | activa |
| 4 | [Diccionario](specs/04-diccionario.md) | Implementing | selección y recursos | activa si hay datos |
| 5 | [Voz](specs/05-voz-offline.md) | Implementing | frases y eventos | activa si hay voz local |
| 6 | [Accesibilidad](specs/06-accesibilidad.md) | Implementing | comandos y shell | activa |
| 7 | [Descansos](specs/07-descansos.md) | Verified | actividad de sesión | optativa |
| 8 | [Estudio](specs/08-estudio-lectores.md) | Implementing | las cuatro condiciones | sólo desarrollo |
| 9 | [Shell de lectura](specs/09-shell-de-lectura.md) | Verified | comandos, paneles y locators | activa |

Las banderas son constantes y preferencias locales; nunca se consultan fuera
del equipo. Durante implementación comienzan apagadas. Búsqueda, tipografía,
diccionario, voz y accesibilidad pasan a activas al quedar `Verified`; página
refluida conserva la etiqueta beta hasta completar el estudio.

## Contratos transversales

- Los lectores emiten eventos de locator/layout/selección, aceptan presentación
  continua o paginada y anuncian capacidades. Ninguno persiste por su cuenta.
- La sesión mantiene como máximo 20 puntos de regreso; sólo un salto explícito
  desde búsqueda, notas o capítulos añade uno.
- Los comandos de usuario se expresan por intención (`reader.search`,
  `reader.back`, `speech.toggle`) y los adaptadores de teclado/gamepad los
  traducen sin duplicar reglas.
- Nuevos JSON se validan, escriben atómicamente, entran en `flush`, respaldo,
  diagnóstico, uso y borrado del libro.
- Los recursos de diccionario son de sólo lectura, versionados y con licencia
  propia. No alteran la licencia GPL-3.0 del código.

## Puertas de entrega

1. Requisitos y pruebas trazables.
2. `npm run typecheck`, suite unitaria y fixtures verdes.
3. Recorrido Electron de la capacidad y comprobación sin red.
4. Sin regresión superior al 10 % en apertura, navegación o memoria de los
   recorridos existentes.
5. Smoke tests secuenciales en Windows, macOS y Linux.

## Evidencia de implementación actual

- `npm run check`: contratos y 307 pruebas unitarias.
- `npm run e2e:read`: lectura, tipografía, guía, notas y reapertura.
- `npm run e2e:experience`: búsqueda/regreso, diccionario, página beta y
  registrador de estudio.
- Pendiente para graduar las specs `Implementing`: corpus completos firmados,
  smoke TTS y accesibilidad en las tres plataformas y estudio con 16 lectores.

## No objetivos

No se incorporan SQLite, EPUB, framework de UI, motor neuronal de voz, cuentas,
telemetría, IA, recomendaciones ni funciones sociales. Tampoco RSVP,
gamificación obligatoria, mayor desenfoque por defecto ni afirmaciones médicas
sobre temas o tipografías.
