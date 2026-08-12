# ADR 0001: local-first, JSON versionado y adaptadores de formato

## Estado

Aceptada.

## Decisión

Lector seguirá funcionando completamente offline. En el primer hito conserva
JSON versionado y atómico, ahora detrás de repositorios y colas por recurso. No
se incorpora SQLite hasta que búsqueda global o volumen de biblioteca aporten
una necesidad medida.

PDF queda detrás de `DocumentIngestor`. EPUB añadirá otro adaptador sin cambiar
sesión, biblioteca, locators, notas ni lectores. La UI continúa en DOM nativo;
la comprobación estática se adopta gradualmente mediante JSDoc y `checkJs`.

## Consecuencias

- No hay migración de datos ni reescritura de UI en este hito.
- Las operaciones IPC se expresan como intención y se validan en main.
- Todo trabajo por documento necesita token de sesión y cancelación.
- Los límites nuevos pueden migrarse a TypeScript o SQLite por partes.

