# Avisos de datos lingüísticos

Los paquetes completos de diccionario se generan separadamente del código:

- Wikcionario español: contenido bajo CC BY-SA 4.0 y GFDL, con atribución a
  sus colaboradores y fuente en https://dumps.wikimedia.org/eswiktionary/.
- Open English WordNet: Open English WordNet Team, CC BY 4.0,
  https://en-word.net/.

El paquete espanol incluido se genero del dump de Wikcionario del 4 de agosto
de 2026 mediante Wiktextract/Kaikki. El archivo `en/common.json` sigue siendo
una muestra de desarrollo hasta incorporar Open English WordNet completo.

# Avisos de lectura en voz alta

- `@mintplex-labs/piper-tts-web`, MIT, basado en Piper y vits-web.
- `@diffusionstudio/piper-wasm`, MIT.
- Modelo `es_ES-davefx-medium`; conjunto de datos de voz publicado como CC0.
  La ficha del modelo se distribuye en
  https://huggingface.co/diffusionstudio/piper-voices/tree/main/es/es_ES/davefx/medium.

El modelo, ONNX Runtime y el fonemizador WebAssembly se sirven exclusivamente
desde los recursos empaquetados de Lector. La síntesis no consulta servicios de
voz ni descarga modelos durante la lectura.
