# Lector

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
| Biblioteca | `Ctrl+L` o `Esc` |

Los ajustes (tipografía, cuerpo, interlineado, ancho de columna, tema,
intensidad del desenfoque y del atenuado) se aplican en vivo. En la vista de
página, «Parada» elige si el foco se detiene por párrafos o recorre la hoja
original por grupos de renglones.

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
   disponible es AGPL y la aplicación es MIT.
4. **Persistencia** (`electron/storage.js`) — biblioteca, progreso, notas,
   texto reconocido y ajustes en JSON bajo `userData`. El caché lleva versión
   con migraciones: al reprocesar un libro, el punto de lectura y las notas se
   re-anclan buscando su texto en vez de perderse.

El progreso y los marcadores se anclan al **offset de carácter**, nunca al
número de línea. Por eso puedes cambiar el cuerpo de letra a mitad de capítulo
y seguir exactamente en la misma frase.

## Generar el ejecutable

```bash
npm run build
```

Deja `dist/Lector.exe`: un único archivo portable (~100 MB) que se ejecuta con
doble clic, sin instalar nada. El icono se genera aparte con `npm run icon`,
que lo dibuja y lo guarda en `build/icon.ico`. Contra la aplicación empaquetada
las tareas de desarrollo exigen la señal extra `LECTOR_ALLOW_TASKS=1`.

## Desarrollo

```bash
npm test         # pruebas unitarias y de reconstrucción del texto
npm run fixtures # regenera el PDF de prueba y corre el pipeline sobre él
npm run verify   # las dos cosas
npm run smoke    # comprueba que la aplicación arranca
```

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

`vendor/` no viaja con el repositorio (está en `.gitignore`) y hay que
poblarlo aparte en un clon nuevo:

- `vendor/tesseract/spa.traineddata.gz` y `eng.traineddata.gz` — los idiomas
  del OCR, descargados de [tessdata](https://github.com/naptha/tessdata)
  (los mismos que `tesseract.js` bajaría de la red en su uso normal).
- `vendor/layout/` (opcional) — el modelo DocLayNet en ONNX con su
  `config.json` y `preprocessor.json`. El modelo es **AGPL** y la aplicación
  MIT: por eso no se versiona ni se empaqueta, solo se usa si está instalado.

## Límites conocidos

- El OCR reconoce **español e inglés**; otros idiomas necesitarían sus
  traineddata en `vendor/tesseract/`.
- Las páginas **mixtas** (mitad imagen, mitad texto nativo) no pasan por OCR:
  se lee su texto nativo y la imagen se hojea en la vista de página.
- No hay lectura en voz alta ni búsqueda dentro del libro, todavía.
