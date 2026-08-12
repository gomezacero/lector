# Code signing policy

Las versiones oficiales de Lector para Windows se construyen desde el repositorio
público [`gomezacero/lector`](https://github.com/gomezacero/lector) mediante un
workflow automatizado y verificable. Cada solicitud de firma requiere aprobación
manual y sólo puede originarse en una revisión etiquetada para publicación.

Free code signing provided by
[SignPath.io](https://about.signpath.io/), certificate by
[SignPath Foundation](https://signpath.org/).

La incorporación de SignPath está pendiente de aprobación. Hasta entonces no se
presentará ningún ejecutable sin firma como una versión pública firmada.

## Roles

- Committer y reviewer: [`gomezacero`](https://github.com/gomezacero).
- Approver de solicitudes de firma: [`gomezacero`](https://github.com/gomezacero).

Las contribuciones de personas sin acceso directo requieren revisión antes de
integrarse. La cuenta mantenedora debe usar autenticación multifactor tanto en
GitHub como en SignPath.

## Reglas de publicación

1. El código, scripts de build y workflow pertenecen al repositorio público.
2. El artefacto se construye en un runner hospedado desde un commit identificable.
3. Ninguna clave privada de firma se entrega al build ni se guarda en GitHub.
4. Las pruebas, comprobaciones de red y validación del paquete deben pasar.
5. Una persona autorizada revisa y aprueba manualmente la solicitud.
6. El ejecutable firmado se valida por titular, sello de tiempo y SHA-256 antes
   de adjuntarlo a una versión.
7. Cada versión enlaza el commit fuente y publica su checksum.

La implementación técnica y el procedimiento alternativo con certificado propio
se documentan en
[`docs/distribution/windows-code-signing.md`](docs/distribution/windows-code-signing.md).

## Privacidad

This program will not transfer any information to other networked systems unless
specifically requested by the user or the person installing or operating it.

Consulta la [`política de privacidad`](PRIVACY.md) para conocer los datos locales,
los recursos offline y las acciones explícitas que pueden abrir sistemas externos.
