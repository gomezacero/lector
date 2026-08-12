# Lector

Lector es un lector de PDF local y de código abierto, creado para convertir
novelas y libros extensos en una experiencia de lectura cómoda, continua y
personalizable. No requiere cuentas, telemetría ni conexión durante la lectura.

[Licencia GPL-3.0](LICENSE) · [Privacidad](PRIVACY.md) ·
[Contribuir](CONTRIBUTING.md) · [Política de firma](CODE_SIGNING_POLICY.md)

Aplicación de escritorio para leer libros en PDF con foco línea a línea: la
línea activa se ve nítida y el resto del texto queda atenuado y difuminado.
Pensada para leer cómodamente en un portátil.

## Uso

```bash
npm start
```

Abre un PDF con `Ctrl+O`. La primera vez el libro se procesa (unos segundos);
después se abre al instante desde la caché.

### Mientras lees

| Acción | Tecla |
|---|---|
| Bajar / subir una línea | rueda del ratón, `↓` `↑`, `espacio`, `j` `k` |
| Avanzar una pantalla (o pasar la hoja) | `AvPág` / `RePág` |
| Cambiar de capítulo | `→` `←` |
| Índice de capítulos | clic en el título del capítulo (HUD) |
| Saltar a cualquier punto | la barra del borde derecho, arrastrando o con un clic |
| Principio / final | `Inicio` / `Fin` |
| Marcar la línea actual | `M` |
| Ajustes de lectura | `Ctrl+,` |
| Marcadores y notas | `Ctrl+B` |
| Buscar dentro del libro | `Ctrl+F` |
| Volver tras una búsqueda, nota o capítulo | `Alt+←` |
| Escuchar o pausar una voz local | `Ctrl+Mayús+Espacio` |
| Biblioteca | `Ctrl+L` o `Esc` |

Los ajustes (tipografía, cuerpo, interlineado, ancho de columna, tema,
intensidad del desenfoque y del atenuado) se aplican en vivo. En la vista de
página, «Parada» elige si el foco se detiene por párrafos o recorre la hoja
original por grupos de renglones.

La lectura refluida puede verse como flujo continuo o como páginas estables en
beta. Los presets tipográficos, el diccionario y la lectura en voz alta son
locales; esta última sólo muestra voces que el sistema declare offline. Los
avisos de descanso, historial de vocabulario y estadísticas están apagados por
defecto.

## Cómo funciona

Hay dos maneras de leer. La prosa se re-maqueta como un e-reader, con la
tipografía y el ancho que elijas; los documentos técnicos —columnas, fórmulas,
muchas figuras— se enseñan sobre la página original, resaltando una región
cada vez. La ficha del libro sugiere la vista y `V` cambia entre ellas.

1. **Ingesta** (`src/pdf/`) — `pdf.js` entrega fragmentos de texto con
   coordenadas, no párrafos. `lines.js` los reúne en renglones, `blocks.js`
   descarta el mobiliario de página (titulillos repetidos, folios), recompone
   las palabras partidas con guion y agrupa los renglones en párrafos, y
   `chapters.js` deduce los capítulos del índice del PDF o de la tipografía.
   `pageKind.js` clasifica cada página (texto, escaneada, mixta) y
   `sections.js` aparta cubierta e índices de la lectura.
2. **Lectura** (`src/reader/`) — el texto se pinta en dos capas idénticas: una
   difuminada y otra nítida recortada a la banda de la línea activa con un
   degradado. El corte de líneas no se reimplementa: se le pregunta al
   navegador con `Range.getClientRects()`, y por eso el foco cae exacto. Las
   figuras aparecen en el flujo como recortes de la página original.
3. **OCR local** (`src/ocr/`) — un PDF escaneado se hojea desde el primer
   momento y, si aceptas, Tesseract reconoce su texto en segundo plano, sin
   red: worker, WASM e idiomas (español e inglés) van dentro del paquete. Al
   terminar, el libro se reconstruye con el texto y se lee línea a línea.
4. **Modelo de layout local** (`src/layout/`, opcional) — si el modelo está
   instalado (`vendor/layout/`), las portadillas de capítulo se analizan en
   segundo plano con un detector DocLayNet (ONNX, sin red) y sus paradas
   pasan a ser las cajas detectadas —título, párrafo, tabla, figura con su
   pie— en orden de lectura por corte recursivo de blancos. Sin el modelo,
   las heurísticas mandan como siempre. **No se empaqueta todavía**: el ONNX
   disponible se mantiene fuera de la distribución oficial y las heurísticas
   locales siguen siendo el comportamiento compatible.
4. **Persistencia** (`electron/storage.js`) — biblioteca, progreso, notas,
   texto reconocido y ajustes en JSON bajo `userData`. El caché lleva versión
   con migraciones: al reprocesar un libro, el punto de lectura y las notas se
   re-anclan buscando su texto en vez de perderse.

El progreso y los marcadores se anclan al **offset de carácter**, nunca al
número de línea. Por eso puedes cambiar el cuerpo de letra a mitad de capítulo
y seguir exactamente en la misma frase.

## Generar el ejecutable de Windows

```bash
npm run build:win
```

Genera `dist/Lector-Setup.exe`, el instalador recomendado. Instala Lector para
el usuario actual, crea accesos directos y ofrece una desinstalación normal sin
borrar la biblioteca, el progreso ni los ajustes. El portable queda como canal
secundario y se genera con `npm run build:win:portable`; para construir ambos se
usa `npm run build:win:all`.

En equipos administrados que aplican Windows Defender Application Control,
cualquier ejecutable debe firmarse con un certificado de firma de código
aceptado por la política de la organización. Estos comandos son para pruebas
locales: un build correcto no significa que el archivo esté listo para
distribuir.

La publicación usa una puerta distinta:

```powershell
$env:WINDOWS_SIGNER_SUBJECT = 'CN=Titular exacto del certificado, ...'
npm run release:win
```

Ese comando detiene la entrega si falta la identidad de firma, la firma
Authenticode no es válida, el titular no coincide o no existe sello de tiempo;
al terminar genera también `dist/Lector-Setup.exe.sha256`. La elección entre
certificado IV/OV y SignPath Foundation, el manejo seguro de la clave y el
procedimiento completo están en
[`docs/distribution/windows-code-signing.md`](docs/distribution/windows-code-signing.md).

El icono se genera aparte con `npm run icon`. Contra la aplicación empaquetada
las tareas de desarrollo exigen la señal extra `LECTOR_ALLOW_TASKS=1`.

## Desarrollo

```bash
npm test         # pruebas unitarias y de reconstrucción del texto
npm run typecheck # contratos JSDoc y límites nuevos
npm run check    # comprobación estática y pruebas
npm run fixtures # regenera el PDF de prueba y corre el pipeline sobre él
npm run verify   # las dos cosas
npm run smoke    # comprueba que la aplicación arranca
npm run e2e:read # recorrido completo del lector
npm run e2e:experience # búsqueda, regreso, diccionario, página beta y estudio
```

La arquitectura, contratos y reglas de evolución se documentan en
[`docs/architecture.md`](docs/architecture.md) y
[`docs/data-model.md`](docs/data-model.md).

La evolución de búsqueda, paginación refluida, tipografía, diccionario, voz,
accesibilidad y bienestar se desarrolla mediante el
[`SDD maestro de experiencia de lectura`](docs/sdd/experiencia-lectura.md). Las
ocho especificaciones y su trazabilidad viven en [`docs/sdd/`](docs/sdd/README.md).

Desde el menú **Archivo → Exportar respaldo** se copian biblioteca, ajustes,
notas, OCR y portadas después de vaciar las escrituras pendientes. **Ayuda →
Exportar diagnóstico** genera un JSON local con versiones, resumen de la
biblioteca y las últimas líneas del log; ninguno de los dos usa la red.

Para ver el lector funcionando de extremo a extremo y dejar capturas en
`test/screenshots/`:

```bash
node scripts/run-electron-task.mjs read test/fixtures/libro-prueba.pdf
```

Recorre el uso real —abrir, leer, cambiar ajustes, marcar, volver a la
biblioteca y reabrir— y verifica las invariantes: que las dos capas tienen el
mismo texto, que la banda de foco está bien formada y dentro de la pantalla, y
que el punto de lectura no se mueve al re-maquetar. `LECTOR_TASK_MODE=flow`
fuerza la vista y `LECTOR_TASK_OCR=1` acepta el reconocimiento de un escaneado
y espera al libro reconstruido. Las tareas de desarrollo trabajan sobre un
`userData` de usar y tirar, así que no tocan tu biblioteca.

La tarea `ocr` prueba Tesseract bajo la CSP real y deja los fixtures del OCR
(`test/fixtures/ocr-tesseract.json` y `escaneado-texto.pdf`):

```bash
node scripts/run-electron-task.mjs ocr test/fixtures/libro-prueba.pdf
```

`pdf.js` necesita `Worker` y DOM, así que el pipeline no se puede probar con
Node a secas: los tests unitarios trabajan sobre fixtures y la prueba de
extremo a extremo corre dentro de Electron.

### Dependencias vendorizadas

Los recursos grandes de `vendor/` no viajan con el repositorio. Un clon nuevo
los prepara así:

```bash
npm run vendor:prepare
```

- `vendor/tesseract/spa.traineddata.gz` y `eng.traineddata.gz` — los idiomas
  del OCR, descargados de [tessdata](https://github.com/naptha/tessdata)
  (los mismos que `tesseract.js` bajaría de la red en su uso normal).
- `vendor/tts/voices/.../es_ES-davefx-medium.*` — la voz española offline.
- `vendor/layout/` (opcional) — el modelo DocLayNet en ONNX con su
  `config.json` y `preprocessor.json`. Se mantiene como recurso opcional, no se
  versiona ni se empaqueta; sólo se usa si está instalado localmente.

OCR y voz proceden de revisiones inmutables y `vendor:prepare` valida cada
descarga mediante SHA-256. Los builds de Windows ejecutan ese paso
automáticamente. El modelo opcional de layout no se descarga ni forma parte de
las versiones oficiales.

## Licencia y versiones oficiales

El código de Lector se distribuye bajo **GNU GPL v3.0 exclusivamente**. Puedes
usarlo, estudiarlo, modificarlo y redistribuirlo bajo sus condiciones. El nombre
y la identidad visual no conceden por sí mismos autorización para presentar un
fork como una versión oficial; consulta [`TRADEMARKS.md`](TRADEMARKS.md).

Las versiones oficiales serán las publicadas por
[`gomezacero`](https://github.com/gomezacero) desde el repositorio y los canales
enlazados por el proyecto. La firma de código acredita el origen del binario,
no cambia las libertades concedidas por GPL-3.0.

## Límites conocidos

- El OCR reconoce **español e inglés**; otros idiomas necesitarían sus
  traineddata en `vendor/tesseract/`.
- Las páginas **mixtas** (mitad imagen, mitad texto nativo) no pasan por OCR:
  se lee su texto nativo y la imagen se hojea en la vista de página.
- El repositorio trae un shard mínimo del diccionario para desarrollo. Los
  paquetes completos ES/EN se generan con `scripts/build-dictionaries.mjs` y
  deben fijarse con checksum antes de una distribución pública.
- La calidad y disponibilidad de lectura en voz alta depende de las voces
  locales instaladas en el sistema; nunca se usa una voz remota como repuesto.
- Página refluida conserva la etiqueta beta hasta completar el estudio con
  lectores descrito en `docs/sdd/specs/08-estudio-lectores.md`.
