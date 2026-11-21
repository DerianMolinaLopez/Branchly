# Builds the Windows installers (NSIS .exe and MSI) on a Windows machine.
# Results go to dist-windows/. Requires Node.js 20+, Rust (MSVC toolchain),
# the "Desktop development with C++" Build Tools and WebView2 (included in
# Windows 10/11).
#
# Usage (PowerShell): scripts\build-windows.ps1
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)

Write-Host '==> Dependencias de npm'
npm ci --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'npm ci falló' }

Write-Host '==> Compilando (NSIS y MSI)'
npx tauri build --bundles nsis,msi
if ($LASTEXITCODE -ne 0) { throw 'tauri build falló' }

Write-Host '==> Copiando a dist-windows/'
$bundle = Join-Path $PWD 'target\release\bundle'
$out = Join-Path $PWD 'dist-windows'
if (Test-Path $out) { Remove-Item -Recurse -Force $out }
New-Item -ItemType Directory -Path $out | Out-Null
Copy-Item "$bundle\nsis\*.exe", "$bundle\msi\*.msi" $out

Push-Location $out
Get-ChildItem -File | Where-Object Name -ne 'SHA256SUMS-windows.txt' | ForEach-Object {
  $hash = (Get-FileHash $_.Name -Algorithm SHA256).Hash.ToLower()
  "$hash  $($_.Name)"
} | Set-Content -Encoding ascii SHA256SUMS-windows.txt
Pop-Location

Get-ChildItem $out | Format-Table Name, @{ n = 'MB'; e = { [math]::Round($_.Length / 1MB, 1) } }
