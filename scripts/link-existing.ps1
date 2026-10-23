[CmdletBinding()]
param([string]$Origen = "")
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($Origen)) {
    $Origen = Join-Path (Split-Path -Parent $Root) 'qwen-imagen-studio-main'
}
if (!(Test-Path -LiteralPath $Origen)) { throw "No encuentro el proyecto original en: $Origen`nEjecuta de nuevo con: powershell -File scripts\link-existing.ps1 -Origen 'C:\ruta\qwen-imagen-studio-main'" }
$names = @('models','runtime-v0.2.1','runtime-cpu-v0.2.1','runtime-vulkan-v0.2.1','node')
foreach ($name in $names) {
    $src = Join-Path $Origen $name
    $dst = Join-Path $Root $name
    if (!(Test-Path -LiteralPath $src)) { Write-Host "Omitido: $name (no existe en el origen)" -ForegroundColor DarkGray; continue }
    if (Test-Path -LiteralPath $dst) { Write-Host "Ya existe: $name" -ForegroundColor Yellow; continue }
    cmd.exe /c "mklink /J `"$dst`" `"$src`"" | Out-Host
    if (!(Test-Path -LiteralPath $dst)) { throw "No se pudo vincular $name" }
}
Write-Host "Listo. Qwen Imagen Pascal reutilizara tus modelos/runtime sin copiarlos ni descargarlos." -ForegroundColor Green
