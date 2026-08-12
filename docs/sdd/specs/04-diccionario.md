# SDD-04: diccionario offline español e inglés

**Estado:** Implementing

El motor, LRU, popover, persistencia y build reproducible están implementados.
La distribución de desarrollo contiene un shard mínimo; faltan generar y
firmar los corpus completos para marcar esta spec `Verified`.

## Requisitos y UX

- **RX-DICT-001:** generar shards reproducibles desde un dump fijado de
  Wikcionario español y Open English WordNet; registrar versión y SHA-256.
- **RX-DICT-002:** normalizar lemas y formas, cargar shards por prefijo y
  mantener como máximo ocho en memoria.
- **RX-DICT-003:** doble clic/selección de una palabra abre un popover con lema,
  clase, acepciones, formas y pronunciación disponible; `Escape` restaura foco.
- **RX-DICT-004:** la página rasterizada ofrece una entrada manual prellenada
  desde el extracto. No abre navegador ni consulta API.
- **RX-DICT-005:** historial por libro optativo, limitado a 500 entradas,
  borrable y desactivado por defecto.

## Licencias, errores y privacidad

Los shards de Wikcionario conservan CC BY-SA/GFDL; Open English WordNet conserva
CC BY 4.0. Ambos incluyen atribución en `THIRD_PARTY_NOTICES`. Si falta un shard,
se muestra “definición no instalada”; nunca se intenta descargarlo.

## Pruebas, rendimiento y aceptación

Cubrir tildes, flexiones, palabra desconocida, shard corrupto, LRU e historial
desactivado. Objetivo: menos de 150 ms en frío y 30 ms en caliente. Aceptado con
build reproducible, checksums y búsqueda demostrablemente sin red.
