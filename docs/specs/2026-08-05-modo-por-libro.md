# Modo de lectura por libro

## Por qué

El modo de lectura se guarda hoy en los ajustes globales. Leer una novela línea
a línea y después abrir un artículo y pasarlo a párrafo a párrafo cambia también
la novela. El modo no es una preferencia del lector: es una propiedad del
documento, porque depende de cómo esté compuesto.

Lo mismo vale para el tamaño de letra o la ampliación de página: una novela pide
letra grande y un artículo pide ampliación, y hoy se pisan entre sí.

Y al abrir un PDF nuevo no hay forma de decir cómo quieres leerlo: la aplicación
decide sola y solo puedes corregirla una vez dentro.

## Qué se construye

### Dos ámbitos de ajuste

| Ámbito | Ajustes | Por qué ahí |
|---|---|---|
| Por libro | modo de lectura, tamaño de letra, interlineado, ancho de columna, ampliación | Dependen de cómo esté compuesto el documento |
| Global | tema, tipografía, alineación, desenfoque, atenuado, difuminado, líneas en foco | Son gusto del lector y no cambian de un libro a otro |

Regla única para resolverlos: **los ajustes efectivos son los globales, con
encima lo que ese libro tenga guardado**. Los globales hacen de valor de partida
para cualquier libro nuevo.

Se guardan en la entrada de biblioteca:

```json
{ "id": "...", "readingMode": "page", "reading": { "fontSize": 20, "pageZoom": 1.6 } }
```

Los libros ya guardados no traen esos campos: la primera vez se usa el modo
detectado y a partir de ahí queda fijado.

### Ficha del libro

Aparece solo al abrir un PDF que todavía no está en la biblioteca. Muestra
título, autor, páginas, palabras y **en qué se basó la detección** ("figuras en
el 50 % de las páginas"), con el modo detectado ya elegido. Un botón entra a
leer.

Reabrir un libro ya conocido lleva directo al punto de lectura. Desde la
biblioteca se puede volver a la ficha para cambiar el modo.

Sin portada por ahora: llegará al rehacer la pantalla de inicio.

## Archivos

- `electron/storage.js` — separa los ajustes globales de los de lectura
- `src/settings/settings.js` — pasa a manejar los dos ámbitos
- `src/library/bookSheet.js` — la ficha (nuevo)
- `src/app.js` — al abrir, decidir entre ficha o lectura directa

## Riesgo

Partir los ajustes en dos ámbitos puede volverse confuso, en el código y al
usarlo. Se mitiga con la regla única de resolución y haciendo que el panel diga
a qué ámbito pertenece cada control.

## Cómo se comprueba

- Abrir un PDF nuevo enseña la ficha; reabrirlo lleva directo a la lectura.
- Poner una novela en línea a línea con letra grande, abrir un artículo y
  ponerlo en párrafo a párrafo, y volver a la novela: sigue como estaba.
- Cambiar el tema en un libro lo cambia en todos.
- Los libros guardados antes de este cambio siguen abriéndose.
