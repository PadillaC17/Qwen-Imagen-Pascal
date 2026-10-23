[CmdletBinding()]
param([int]$Port = 7871, [switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Logs = Join-Path $ProjectRoot 'logs'
New-Item -ItemType Directory -Force -Path $Logs | Out-Null
. (Join-Path $PSScriptRoot 'common.ps1')
$Node = Get-AppNode $ProjectRoot
if (!$Node) { throw 'Falta Node.js. Usa "Vincular modelos existentes.cmd" o el instalador OPCIONAL.' }
$Url = "http://127.0.0.1:$Port"
try {
    $status = Invoke-RestMethod "$Url/api/status" -TimeoutSec 3
    if ($status.app -ne 'qwen-imagen-pascal') { throw 'El puerto esta ocupado por otra aplicacion.' }
    if (!$NoBrowser) { Start-Process $Url }
    exit 0
} catch { if ($_.Exception.Message -match 'ocupado') { throw } }
$Config = Get-Content -LiteralPath (Join-Path $ProjectRoot 'model-config.json') -Raw | ConvertFrom-Json
$Proof = Join-Path $ProjectRoot 'models\merged-lora.json'
$Merged = (Test-Path -LiteralPath $Proof) -and (Test-Path -LiteralPath (Join-Path $ProjectRoot ('models\' + $Config.merged))) -and ((Get-Content -LiteralPath $Proof -Raw | ConvertFrom-Json).output -eq $Config.merged)
[string[]]$Transformer = if ($Merged) { @('models\' + $Config.merged) } else { @(('models\' + $Config.base),('models\loras\' + $Config.runtimeLora)) }
foreach($relative in @($Transformer + @('models\Qwen3VL-8B-Instruct-Q4_K_M.gguf','models\mmproj-Qwen3VL-8B-Instruct-F16.gguf','models\qwen_image_2.1_vae_bf16.safetensors'))) {
    if(!(Test-Path -LiteralPath (Join-Path $ProjectRoot $relative))) { throw "Falta $relative. Ejecuta 'Vincular modelos existentes.cmd' o usa el instalador OPCIONAL." }
}
$cpu = Join-Path $ProjectRoot ($Config.runtimeCpu + '\sd-server.exe')
if(!(Test-Path -LiteralPath $cpu)){throw 'Falta el motor CPU. Usa "Vincular modelos existentes.cmd" o el instalador OPCIONAL.'}
$EngineRecord = Join-Path $Logs 'engine-process.json'
if(Test-Path -LiteralPath $EngineRecord){
    $r=Get-Content -LiteralPath $EngineRecord -Raw | ConvertFrom-Json
    $prior=Get-Process -Id $r.pid -ErrorAction SilentlyContinue
    $allowed=@($Config.runtime,$Config.runtimeCpu,$Config.runtimeVulkan) | ForEach-Object {Join-Path $ProjectRoot ($_ + '\sd-server.exe')}
    if($prior -and $allowed -contains $prior.Path -and $prior.Path -eq $r.executable){Stop-Process -Id $prior.Id}
}
$env:QWEN_PORT = "$Port"
$env:QWEN_ENGINE_PORT = "$($Port+1)"
$env:QWEN_ENGINE_MANAGED = '1'
$Gateway = Join-Path $PSScriptRoot 'server.mjs'
$AppProcess = Start-Process -FilePath $Node -ArgumentList ('"' + $Gateway + '"') -WorkingDirectory $ProjectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $Logs 'app.out.log') -RedirectStandardError (Join-Path $Logs 'app.err.log')
@{ pid=$AppProcess.Id; started=$AppProcess.StartTime.ToUniversalTime().ToString('o'); executable=$Node } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $Logs 'app-process.json')
$deadline=(Get-Date).AddSeconds(30)
$status=$null
do { Start-Sleep -Milliseconds 500; try{$status=Invoke-RestMethod "$Url/api/status" -TimeoutSec 2;break}catch{} } while((Get-Date) -lt $deadline)
if(!$status){throw 'La interfaz no inicio. Revisa logs/app.err.log.'}
if(!$NoBrowser){Start-Process $Url}
Write-Host "Estudio disponible en $Url. Detectando CPU y GPU; los modelos se precargan al abrir la pagina." -ForegroundColor Green
