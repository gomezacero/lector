# Modelo de datos persistente

Las definiciones comprobables están en `src/contracts/models.js`. Este
documento explica estabilidad, propiedad y migraciones.

## Identidad y locator

Un libro se identifica con los primeros 32 hexadecimales del SHA-256 de sus
bytes. Mover o renombrar el PDF conserva la identidad; modificar su contenido
crea un libro nuevo.

`ReadingLocator` contiene:

- `offset`: entero no negativo dentro del texto normalizado; dato canónico.
- `context`: fragmento cercano usado para reanclar tras un reproceso.
- `page`: página original base cero como alternativa para documentos sin texto.

El progreso asociado a Book v11 ya contiene esos campos o es directamente convertible. Los
números de línea, frase y región nunca se persisten.

## Book v11

`Book` es una caché derivada y reemplazable. Contiene metadatos, dimensiones y
clase por página, bloques con offsets, capítulos, roles de sección, comienzo y
final de la obra legible y estadísticas de detección. Los capítulos pueden
marcar secciones auxiliares (`frontmatter` y `supplement`) que siguen siendo
navegables pero no cuentan como capítulos de la obra. El PDF original sigue
siendo la fuente de verdad.

Book v11 es una ampliación compatible de v10: se deriva en sitio, no mueve
texto ni offsets y conserva progreso y notas. Un futuro adaptador EPUB
producirá el mismo modelo o una versión posterior con migración explícita.

## Biblioteca y preferencias

`library.json` contiene una entrada por ID: ruta, metadatos visibles, fechas,
progreso y ajustes propios del libro. `settings.json` guarda sólo preferencias
globales. Los efectivos son globales con los del libro encima.

Las actualizaciones frecuentes usan operaciones específicas:

- `saveProgress(id, progress, lastOpenedAt)`
- `updateReading(id, reading, readingMode)`
- `add/edit/remove` para notas

El reemplazo completo queda reservado para migraciones y reconstrucciones.

## Artefactos por libro

| Archivo | Propiedad | Se conserva al invalidar caché |
|---|---|---|
| `books/<id>.json` | Book derivado | No |
| `books/<id>.notes.json` | Notas y resaltados del usuario | Sí |
| `books/<id>.ocr.json` | Items OCR por página | Sí |
| `books/<id>.layout.json` | Detecciones por página | Sí |
| `books/<id>.vocabulary.json` | Consultas optativas del usuario | Sí |
| `books/<id>.stats.json` | Tiempo activo y pausas con consentimiento | Sí |
| `covers/<id>.jpg` | Portada derivada | Se puede regenerar |

Todas las escrituras JSON son atómicas y se serializan por ruta. Un JSON
corrupto se aparta con fecha antes de devolver el valor inicial.

La búsqueda y las páginas refluidas son índices derivados de sesión: nunca se
persisten. Las voces y los shards del diccionario son recursos de sólo lectura.

## Compatibilidad

- No eliminar campos desconocidos de entradas o progreso durante un upsert.
- Validar antes de escribir, pero migrar o reprocesar antes de rechazar una
  caché antigua al abrir.
- Una migración que mueve texto debe reanclar progreso y notas antes de guardar.
- Los respaldos copian biblioteca, ajustes, libros y portadas después de vaciar
  las colas de escritura.
