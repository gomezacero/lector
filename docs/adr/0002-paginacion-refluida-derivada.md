# ADR 0002: paginación refluida derivada y no persistida

## Estado

Aceptada.

## Decisión

La página refluida se calcula con los renglones reales del navegador y se
cachea sólo en memoria por capítulo, viewport y tipografía. Se persiste el
`ReadingLocator`, nunca un número de página refluida.

## Consecuencias

Cambiar tamaño o tipografía recalcula páginas sin migración. El modo es beta y
optativo hasta SDD-08. La página original continúa siendo un modo distinto.

