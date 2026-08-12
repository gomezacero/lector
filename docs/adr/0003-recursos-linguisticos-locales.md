# ADR 0003: recursos lingüísticos locales y separados

## Estado

Aceptada.

## Decisión

El diccionario se empaqueta en shards de sólo lectura: Wikcionario para español
y Open English WordNet para inglés. El build fija versión y checksum; cada
recurso conserva licencia y atribución separadas del código GPL-3.0.

La voz usa exclusivamente servicios que Web Speech declare locales. Si el
sistema no ofrece ninguno, la función queda no disponible.

## Consecuencias

No hay descargas ni fallback remoto. Los paquetes incrementan el instalador y
su actualización es una operación de release explícita.
