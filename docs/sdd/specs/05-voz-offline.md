# SDD-05: lectura en voz alta offline

**Estado:** Implementing

Controlador y pruebas con port falso están completos. Falta la matriz de smoke
tests con voces locales reales por plataforma.

## Requisitos y UX

- **RX-TTS-001:** sólo listar voces con `localService === true`; si no existen,
  explicar que la voz local no está disponible y no usar alternativas remotas.
- **RX-TTS-002:** comenzar en la frase enfocada y avanzar por locators, con
  resaltado por frase y progreso compartido.
- **RX-TTS-003:** ofrecer pausa/reanudar, anterior/siguiente, velocidad 0.7–2x,
  voz por idioma y temporizador 5/10/15/30 minutos o final de capítulo.
- **RX-TTS-004:** cerrar o cambiar de libro cancela utterance, temporizador y
  callbacks de la sesión anterior.

## Contratos, errores y privacidad

`SpeechPort` aísla Web Speech para pruebas; `SpeechController` recibe frases y
locators. Un error de voz pausa y conserva el locator. No se envía texto fuera
de la aplicación.

## Pruebas y aceptación

Usar un port falso para orden, pausa, velocidad, temporizador y cancelación.
Smoke manual por plataforma confirma voces locales. Aceptado si alternar lectura
visual/voz no duplica ni pierde progreso.
