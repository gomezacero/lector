# Firma y distribución de Lector para Windows

Estado: `Ready` — la puerta de publicación está implementada; falta contratar o
obtener la identidad de firma.

El proyecto eligió GPL-3.0-only y solicitará primero SignPath Foundation. La
solicitud debe declarar también los datos lingüísticos bajo CC BY-SA/GFDL y la
voz CC0 enumerados en `THIRD_PARTY_NOTICES.md`, para que SignPath confirme por
escrito su admisión como recursos abiertos no pertenecientes al código.

## Regla de publicación

`npm run build:win` produce `dist/Lector-Setup.exe`, el instalador NSIS que será
el canal principal. `npm run build:win:portable` produce el canal secundario
`dist/Lector-Portable.exe`; `npm run build:win:all` crea ambos para pruebas. Un
artefacto sin firma sólo es una vista previa y no se publica como estable.

`npm run release:win` es la ruta de publicación local para un certificado
integrado con `electron-builder`. Ejecuta contratos y pruebas, exige que el
empaquetador encuentre una identidad de firma, valida la firma Authenticode y
su sello de tiempo, comprueba el titular esperado y genera
`dist/Lector-Setup.exe.sha256`. Si cualquiera de esos pasos falla, no existe una
versión publicable. La ruta SignPath descrita más abajo incorporará las mismas
comprobaciones en CI cuando la solicitud sea aprobada.

Antes de ejecutarlo hay que declarar el Subject exacto del certificado:

```powershell
$env:WINDOWS_SIGNER_SUBJECT = 'CN=Nombre que aparece en el certificado, ...'
npm run release:win
```

Para inspeccionar manualmente un artefacto ya generado:

```powershell
Get-AuthenticodeSignature .\dist\Lector-Setup.exe | Format-List *
npm run verify:signature
```

El certificado y sus credenciales nunca se guardan en Git, `package.json`, el
YAML de empaquetado ni el ejecutable sin cifrar. El acceso al token físico o al
servicio HSM se concede sólo al trabajo de publicación.

## Identidad que falta obtener

### Ruta A — proyecto público y completamente open source

Solicitar SignPath Foundation. Es gratuito para proyectos que satisfacen sus
condiciones, pero requiere repositorio público y verificable, licencia OSI,
build automatizado reproducible, política de firma, privacidad, MFA y aprobación
manual. El nombre mostrado por Windows será **SignPath Foundation**, no el nombre
personal del autor. Conviene revisar sus
[condiciones vigentes](https://signpath.org/terms) antes de publicar el
repositorio.

Una vez aprobada la solicitud se añadirá un workflow exclusivo de release que:

1. construya el artefacto sin acceso a secretos en un runner hospedado;
2. envíe el artefacto exacto a SignPath;
3. espere aprobación manual;
4. descargue el resultado firmado;
5. ejecute `verify-windows-signature.ps1` y publique sólo ese resultado.

No se debe crear ese workflow con identificadores ficticios: SignPath entrega
`organization-id`, `project-slug`, `signing-policy-slug` y el token necesarios.

### Ruta B — distribución bajo nombre personal o de empresa

Comprar un certificado IV u OV de firma de código emitido por una CA pública y
entregado mediante token criptográfico o servicio HSM/cloud compatible. Desde
junio de 2023 una clave de firma pública nueva no debe manejarse como un PFX
exportable ordinario, de acuerdo con los
[requisitos del CA/Browser Forum](https://cabforum.org/working-groups/code-signing/requirements/).
La integración exacta depende del proveedor elegido:
almacén de certificados y token, cliente cloud o comando de firma remoto.

Para una persona que publica Lector por cuenta propia, un certificado IV suele
ser el punto de entrada natural; para una entidad jurídica, OV. Antes de comprar
hay que confirmar expresamente:

- validación disponible para Colombia;
- nombre exacto que verá el usuario en Windows;
- compatibilidad con Electron/Authenticode y firma SHA-256;
- sello de tiempo RFC 3161;
- token o HSM incluido y número de firmas/builds permitido;
- automatización permitida en CI y coste de renovación.

Azure Artifact Signing no es la ruta propuesta hoy: su Public Trust limita la
incorporación geográfica y actualmente no admite solicitantes de Colombia. La
[comparación oficial de Microsoft](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options)
también aclara que una firma autofirmada sólo sirve para desarrollo o entornos
administrados, no para distribución pública.

Como tercera vía de distribución, Microsoft Store vuelve a firmar gratuitamente
los paquetes MSIX aceptados. Eso exige construir y mantener un paquete Store y
no convierte automáticamente el instalador NSIS actual en un ejecutable público
firmado; se evaluará como canal adicional, no como sustituto silencioso del
instalador descargable.

## Lista de salida

1. Incrementar la versión en `package.json`.
2. Ejecutar `npm ci` desde un checkout limpio.
3. Ejecutar `npm run release:win` en el entorno autorizado para firmar.
4. Confirmar que el titular coincide y el estado es `Valid`.
5. Probar `dist/Lector-Setup.exe` en una máquina Windows limpia, sin certificados de
   desarrollo instalados.
6. Publicar juntos `Lector-Setup.exe` y `Lector-Setup.exe.sha256` por HTTPS. Si
   también se publica el portable, debe llamarse `Lector-Portable.exe`, llevar
   su propio checksum y mostrar el mismo estado de firma.
7. Conservar el artefacto, hash, commit y registro de firma de esa versión.

Una firma válida acredita editor e integridad. No garantiza que SmartScreen
elimine inmediatamente todas sus advertencias: la reputación también se forma
con el historial de archivos y descargas firmadas de manera consistente.
