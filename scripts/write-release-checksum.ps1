[CmdletBinding()]
param(
  [string] $Path = 'dist\Lector.exe'
)

$ErrorActionPreference = 'Stop'
$resolvedPath = Resolve-Path -LiteralPath $Path -ErrorAction Stop
$hash = Get-FileHash -LiteralPath $resolvedPath.Path -Algorithm SHA256
$checksumPath = "$($resolvedPath.Path).sha256"
$line = "$($hash.Hash.ToLowerInvariant())  $([System.IO.Path]::GetFileName($resolvedPath.Path))`n"

[System.IO.File]::WriteAllText(
  $checksumPath,
  $line,
  [System.Text.UTF8Encoding]::new($false)
)

Write-Host "Checksum escrito en $checksumPath"
Write-Host $line.TrimEnd()
