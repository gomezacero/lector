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
| Avanzar una pantalla | `AvPág` / `RePág` |
| Cambiar de capítulo | `→` `←` |
| Principio / final | `Inicio` / `Fin` |
| Marcar la línea actual | `M` |
| Ajustes de lectura | `Ctrl+,` |
| Marcadores y notas | `Ctrl+B` |
| Biblioteca | `Ctrl+L` o `Esc` |

Los ajustes (tipografía, cuerpo, interlineado, ancho de columna, tema,
intensidad del desenfoque y del atenuado) se aplican en vivo.

## Cómo funciona

El PDF no se muestra tal cual: se le extrae el texto y se vuelve a maquetar
como un e-reader, con la tipografía y el ancho que elijas.

1. **Ingesta** (`src/pdf/`) — `pdf.js` entrega fragmentos de texto con
   coordenadas, no párrafos. `lines.js` los reúne en renglones, `blocks.js`
   descarta el mobiliario de página (titulillos repetidos, folios), recompone
   las palabras partidas con guion y agrupa los renglones en párrafos, y
   `chapters.js` deduce los capítulos del índice del PDF o de la tipografía.
2. **Lectura** (`src/reader/`) — el texto se pinta en dos capas idénticas: una
   difuminada y otra nítida recortada a la banda de la línea activa con un
   degradado. El corte de líneas no se reimplementa: se le pregunta al
   navegador con `Range.getClientRects()`, y por eso el foco cae exacto.
3. **Persistencia** (`electron/storage.js`) — biblioteca, progreso, notas y
   ajustes en JSON bajo `userData`.

El progreso y los marcadores se anclan al **offset de carácter**, nunca al
número de línea. Por eso puedes cambiar el cuerpo de letra a mitad de capítulo
y seguir exactamente en la misma frase.

## Generar el ejecutable

```bash
npm run build
```

Deja `dist/Lector.exe`: un único archivo portable (~88 MB) que se ejecuta con
doble clic, sin instalar nada. El icono se genera aparte con `npm run icon`,
que lo dibuja y lo guarda en `build/icon.ico`.

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
que el punto de lectura no se mueve al re-maquetar. Las tareas de desarrollo
trabajan sobre `test/.userdata`, así que no tocan tu biblioteca.

`pdf.js` necesita `Worker` y DOM, así que el pipeline no se puede probar con
Node a secas: los tests unitarios trabajan sobre fixtures y la prueba de
extremo a extremo corre dentro de Electron.

## Límites conocidos

- Pensado para **prosa a una columna**. Las figuras, tablas y fórmulas se
  descartan al extraer el texto.
- Un PDF **escaneado sin capa de texto** no se puede leer: no hay texto que
  extraer. La aplicación lo abrirá vacío.
- No hay lectura en voz alta ni modo "ver la página original".
