# AGENTS.md — contrato operativo de Lector

Estas instrucciones se aplican a todo el repositorio. Su objetivo es permitir
que cualquier agente implemente cambios sin redescubrir la arquitectura ni
debilitar las garantías de privacidad, continuidad y compatibilidad.

## Misión

Lector convierte novelas y libros extensos en PDF en una experiencia de lectura
cómoda, enfocada y local. Prioriza sesiones largas, continuidad exacta y control
del lector. Los documentos técnicos conservan compatibilidad, pero no gobiernan
la experiencia.

## Fuentes de verdad y precedencia

1. La solicitud actual del usuario define el objetivo.
2. Este archivo define el método y las restricciones del repositorio.
3. [`docs/sdd/`](docs/sdd/README.md) define comportamiento observable, estados,
   requisitos y aceptación de experiencia.
4. [`docs/architecture.md`](docs/architecture.md) define límites entre módulos.
5. [`docs/data-model.md`](docs/data-model.md) y `src/contracts/models.js` definen
   contratos persistentes.
6. Los ADR de [`docs/adr/`](docs/adr/) explican decisiones irreversibles o
   transversales.
7. El código y las pruebas muestran la implementación actual, pero no pueden
   contradecir silenciosamente una especificación estable.

Si una solicitud cambia comportamiento estable, actualizar primero la spec y,
cuando cambie un límite arquitectónico, añadir o modificar un ADR. No mantener
la misma regla copiada en varios documentos.

## Invariantes no negociables

- Lectura, búsqueda, OCR, diccionario, voz y procesamiento funcionan sin red.
- No añadir cuentas, telemetría, anuncios, recomendaciones remotas ni descargas
  silenciosas.
- El PDF original es la fuente de verdad; `Book v11` es caché derivada.
- `ReadingLocator.offset` es el ancla canónica. Línea, frase, pantalla y región
  son representaciones transitorias y no se persisten.
- Abrir, buscar, escuchar, cambiar presentación, anotar y regresar conservan el
  mismo locator.
- El renderer no obtiene Node ni `ipcRenderer`. Toda capacidad del sistema pasa
  por `electron/preload.cjs` y un IPC de intención validado en el proceso
  principal.
- Un lector emite progreso y eventos; nunca escribe almacenamiento directamente.
- Toda tarea por libro usa token de sesión, admite cancelación y descarta
  callbacks tardíos de libros anteriores.
- Toda escritura diferida tiene `flush()` y prueba de cierre inmediato.
- Todo artefacto nuevo por libro participa en validación, escritura serializada,
  respaldo, diagnóstico, borrado y recuperación de corrupción.
- Mantener compatibilidad con biblioteca, progreso, notas y ajustes existentes.
- No incorporar SQLite, EPUB, framework de UI o servicios remotos sin una spec y
  una decisión arquitectónica explícita.

## Mapa del código

| Área | Responsabilidad |
|---|---|
| `electron/main.js` | Ventana endurecida, protocolo `app://`, permisos, menús e IPC |
| `electron/preload.cjs` | Puente mínimo de operaciones de intención |
| `electron/storage.js` | `userData`, validación, colas por ruta y JSON atómico |
| `src/app.js` | Composition root; conecta controladores y eventos de UI |
| `src/session/` | Libro activo, locator, tareas de fondo y shell |
| `src/document/` | Adaptadores que producen el modelo normalizado |
| `src/pdf/` | Extracción, líneas, columnas, bloques, capítulos y secciones |
| `src/reader/` | Contrato común y motores de flujo/página |
| `src/search/` | Índice efímero por sesión y resultados con offsets exactos |
| `src/speech/` | Voz local y sincronización mediante locators |
| `src/dictionary/` | Shards lingüísticos locales y vocabulario optativo |
| `src/ocr/` | OCR Tesseract local, parcial y reanudable |
| `src/layout/` | Layout ONNX opcional; no forma parte de la distribución oficial |
| `src/wellbeing/` | Tiempo activo, pausas y métricas optativas |
| `src/contracts/` | Modelos y validadores JSDoc comprobados por TypeScript |
| `test/` | Pruebas unitarias, contratos, fixtures y recorridos Electron |

`src/app.js` sólo debe componer. No devolverle persistencia, ciclos de vida,
cancelación o reglas de dominio extraídas a controladores.

## Flujo obligatorio de trabajo

1. Inspeccionar estado de Git y preservar cambios ajenos.
2. Leer la spec y los contratos relacionados antes de editar.
3. Reproducir el fallo o definir evidencia observable del cambio.
4. Añadir o actualizar pruebas con el requisito `RX-<SPEC>-NNN` cuando exista.
5. Implementar la vertical mínima completa, no una capa aislada sin integración.
6. Ejecutar la verificación proporcional indicada abajo.
7. Revisar `git diff --check`, cambios no deseados y compatibilidad persistente.
8. Actualizar spec, ADR, arquitectura o README sólo cuando el comportamiento o
   la operación realmente hayan cambiado.
9. Reportar resultado, pruebas, riesgos pendientes y archivos relevantes.

No marcar una spec `Verified` sólo porque compile. Todos sus requisitos deben
tener prueba o evidencia enlazada y superar sus puertas de aceptación.

## Reglas por tipo de cambio

### Texto, offsets e ingesta

- Si cambia el texto normalizado o sus offsets, subir `CACHE_VERSION`.
- Definir migración o reproceso y reanclar progreso y notas antes de guardar.
- Probar encabezados, folios, guiones, capítulos, secciones y PDFs dañados según
  el alcance.

### Persistencia e IPC

- Preferir comandos de intención a escrituras genéricas.
- Validar ID, estructura, tamaño y ruta en cada frontera.
- No eliminar campos desconocidos durante un upsert compatible.
- Probar concurrencia, JSON corrupto y cierre durante escritura.

### UI y lectores

- Mantener interfaz nativa ESM/DOM; no introducir un framework por comodidad.
- Usar comandos semánticos para teclado, rueda, controles y gamepad.
- Respetar foco, teclado, `prefers-reduced-motion`, contraste y escala de UI.
- Conservar locator en relayout, cambio de modo, panel y cambio tipográfico.
- Una captura bonita no sustituye pruebas de interacción, cierre y regreso.

### OCR, voz y recursos

- Nunca caer silenciosamente a servicios remotos.
- Las voces deben ser locales; si no existen, mostrar la función como no
  disponible.
- Fijar recursos externos por revisión y SHA-256; documentar su licencia en
  `THIRD_PARTY_NOTICES.md`.
- No empaquetar el modelo de layout opcional mientras su licencia no esté
  aprobada para la distribución.

### Seguridad y privacidad

- Conservar `contextIsolation`, sandbox y navegación restringida.
- Limitar enlaces externos a protocolos permitidos y acciones explícitas.
- No incluir secretos, rutas personales, libros comerciales ni datos reales en
  commits, fixtures, capturas, diagnósticos o logs.
- Usar PDFs sintéticos o legalmente redistribuibles en pruebas.

## Verificación proporcional

Ejecutar como mínimo:

| Cambio | Verificación |
|---|---|
| Documentación | enlaces locales, renderizado cuando aplique y `git diff --check` |
| Lógica o contratos | `npm run check` y pruebas afectadas |
| Ingesta o modelo | `npm run fixtures`, `npm test` y reanclaje cuando aplique |
| UI o experiencia | `npm run check` y el recorrido `e2e:*` correspondiente |
| Shell o integración amplia | `npm run smoke`, `npm run e2e:read`, `npm run e2e:experience` |
| Temas/layout visual | `npm run e2e:visual` e inspección de capturas |
| Voz | `npm run smoke:tts` en una plataforma con voz local compatible |
| Recursos offline | `npm run vendor:prepare` y verificación de checksums/licencias |
| Empaquetado Windows | `npm run build:win` o `npm run build:win:all` sólo si es necesario |

Comandos base:

```bash
npm ci
npm run check
npm test
npm run fixtures
npm run smoke
npm run e2e:read
npm run e2e:experience
npm run e2e:visual
```

En Linux, los recorridos Electron necesitan `xvfb-run`; seguir
`.github/workflows/ci.yml`. Una descarga externa fallida durante `npm ci` no es
evidencia de regresión: confirmar el log y reintentar el trabajo fallido antes
de modificar código.

## Archivos generados y binarios

- `dist/`, `vendor/`, `test/screenshots/` y varios fixtures son generados o
  ignorados. No añadirlos salvo que el objetivo requiera deliberadamente un
  asset versionado.
- Los assets públicos del README viven en `docs/assets/readme/`.
- `npm run vendor:prepare` recupera OCR y voz desde revisiones inmutables.
- No editar artefactos generados cuando pueda corregirse la fuente o el script.

## Distribución

- `npm run build:win` produce `dist/Lector-Setup.exe`, canal principal.
- `npm run build:win:portable` produce el canal secundario.
- Un build sin firma puede publicarse sólo como vista previa claramente marcada;
  nunca como versión estable o firmada.
- `npm run release:win` exige identidad autorizada, Authenticode válido, sello
  de tiempo y checksum.
- No crear identificadores ficticios de SignPath ni aceptar términos legales en
  nombre del mantenedor. Seguir `CODE_SIGNING_POLICY.md`.
- No publicar, subir assets, crear releases o modificar servicios externos salvo
  que la solicitud autorice distribución o publicación.

## Definición de terminado

Un cambio está terminado cuando:

- satisface el comportamiento solicitado y la spec aplicable;
- mantiene las invariantes offline, locator, sesión y persistencia;
- incluye pruebas de éxito, error y callback tardío cuando correspondan;
- pasa la verificación proporcional sin ocultar fallos preexistentes;
- no deja procesos, archivos temporales o cambios ajenos alterados;
- actualiza documentación y trazabilidad sin duplicar fuentes de verdad;
- informa con honestidad cualquier límite que aún dependa de plataforma,
  recurso, licencia, firma o validación con lectores.

