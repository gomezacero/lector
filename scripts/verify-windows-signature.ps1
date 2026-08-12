[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [string[]] $Path = @('dist\Lector-Setup.exe'),

  [string] $ExpectedSubject = $env:WINDOWS_SIGNER_SUBJECT,

  [switch] $RequireTimestamp,

  [switch] $RequireExpectedSubject
)

$ErrorActionPreference = 'Stop'
$failures = [System.Collections.Generic.List[string]]::new()

function Get-Sha256Hex ([string] $LiteralPath) {
  $stream = [System.IO.File]::OpenRead($LiteralPath)
  try {
    $algorithm = [System.Security.Cryptography.SHA256]::Create()
    try {
      $bytes = $algorithm.ComputeHash($stream)
    } finally {
      $algorithm.Dispose()
    }
  } finally {
    $stream.Dispose()
  }
  return (-join ($bytes | ForEach-Object { $_.ToString('x2') }))
}

if ($RequireExpectedSubject -and [string]::IsNullOrWhiteSpace($ExpectedSubject)) {
  throw 'Falta WINDOWS_SIGNER_SUBJECT. Debe contener el Subject exacto del certificado autorizado para publicar Lector.'
}

foreach ($requestedPath in $Path) {
  $resolvedPath = Resolve-Path -LiteralPath $requestedPath -ErrorAction Stop
  $signature = Get-AuthenticodeSignature -LiteralPath $resolvedPath.Path

  if ($signature.Status -ne [System.Management.Automation.SignatureStatus]::Valid) {
    $failures.Add("$($resolvedPath.Path): firma no valida ($($signature.Status)). $($signature.StatusMessage)")
    continue
  }

  if ($null -eq $signature.SignerCertificate) {
    $failures.Add("$($resolvedPath.Path): no contiene certificado de firmante.")
    continue
  }

  $subject = $signature.SignerCertificate.Subject
  $issuer = $signature.SignerCertificate.Issuer

  if ($subject -eq $issuer) {
    $failures.Add("$($resolvedPath.Path): el certificado es autofirmado y no sirve como confianza publica.")
  }

  if (-not [string]::IsNullOrWhiteSpace($ExpectedSubject) -and $subject -ne $ExpectedSubject) {
    $failures.Add("$($resolvedPath.Path): titular inesperado. Esperado '$ExpectedSubject'; recibido '$subject'.")
  }

  if ($RequireTimestamp -and $null -eq $signature.TimeStamperCertificate) {
    $failures.Add("$($resolvedPath.Path): la firma no contiene sello de tiempo verificable.")
  }

  $hash = Get-Sha256Hex $resolvedPath.Path
  Write-Host "Firma valida: $($resolvedPath.Path)"
  Write-Host "  Titular:    $subject"
  Write-Host "  Emisor:     $issuer"
  Write-Host "  Huella:     $($signature.SignerCertificate.Thumbprint)"
  if ($null -ne $signature.TimeStamperCertificate) {
    Write-Host "  Timestamp:  $($signature.TimeStamperCertificate.Subject)"
  }
  Write-Host "  SHA-256:    $hash"
}

if ($failures.Count -gt 0) {
  foreach ($failure in $failures) {
    Write-Error $failure -ErrorAction Continue
  }
  exit 1
}
