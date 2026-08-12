# Contribuir a Lector

Gracias por ayudar a construir una lectura digital más cómoda.

## Antes de proponer un cambio

- Lee [`AGENTS.md`](AGENTS.md), que contiene las invariantes, el mapa del código,
  la verificación proporcional y la definición de terminado del repositorio.
- Abre o comenta una incidencia para cambios grandes de experiencia o
  arquitectura.
- No incluyas libros, PDF con copyright, credenciales ni datos personales.
- Conserva el funcionamiento offline y no introduzcas telemetría o servicios de
  red sin una discusión pública y una actualización explícita de privacidad.
- Respeta los contratos y decisiones documentados en [`docs/sdd/`](docs/sdd/)
  y [`docs/adr/`](docs/adr/).

## Comprobaciones

Instala Node.js 22 y ejecuta:

```bash
npm ci
npm run check
```

Los cambios de experiencia deben incluir pruebas y, cuando corresponda, un
recorrido Electron. Describe qué PDF sintético o legalmente redistribuible
usaste; no adjuntes obras comerciales.

## Revisión y licencia

Las contribuciones se revisan antes de integrarse. Al enviar una contribución,
aceptas publicarla bajo la licencia GPL-3.0-only del proyecto y declaras tener
derecho a hacerlo. Conservas el copyright de tu contribución.
