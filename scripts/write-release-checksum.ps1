[CmdletBinding()]
param(
  [string] $Path = 'dist\Lector-Setup.exe'
)

$ErrorActionPreference = 'Stop'
$resolvedPath = Resolve-Path -LiteralPath $Path -ErrorAction Stop
$stream = [System.IO.File]::OpenRead($resolvedPath.Path)
try {
  $algorithm = [System.Security.Cryptography.SHA256]::Create()
  try {
    $hashBytes = $algorithm.ComputeHash($stream)
  } finally {
    $algorithm.Dispose()
  }
} finally {
  $stream.Dispose()
}
$hash = -join ($hashBytes | ForEach-Object { $_.ToString('x2') })
$checksumPath = "$($resolvedPath.Path).sha256"
$line = "$hash  $([System.IO.Path]::GetFileName($resolvedPath.Path))`n"

[System.IO.File]::WriteAllText(
  $checksumPath,
  $line,
  [System.Text.UTF8Encoding]::new($false)
)

Write-Host "Checksum escrito en $checksumPath"
Write-Host $line.TrimEnd()
