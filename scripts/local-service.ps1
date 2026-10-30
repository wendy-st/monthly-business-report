param(
    [ValidateSet('Start', 'Stop')][string]$Action = 'Start',
    [switch]$NoBrowser
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$backendRoot = Join-Path $projectRoot 'backend'
$frontendRoot = Join-Path $projectRoot 'frontend'
$dataRoot = Join-Path $projectRoot 'runtime/data'
$runRoot = Join-Path $projectRoot 'runtime/run'
$registryPath = Join-Path $runRoot 'services.json'
$reportUrl = 'http://127.0.0.1:5186/'
$services = @()
if (Test-Path -LiteralPath $registryPath) {
    $services = Get-Content -LiteralPath $registryPath -Raw | ConvertFrom-Json
}

function Get-OwnedProcess($entry) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($entry.id)"
    if ($process -and $process.CommandLine -and $process.CommandLine.Contains($projectRoot)) { return $process }
    return $null
}

if ($Action -eq 'Stop') {
    foreach ($entry in $services) {
        if (Get-OwnedProcess $entry) {
            Stop-Process -Id $entry.id -PassThru | Wait-Process -Timeout 15
            Write-Host "已停止：$($entry.name)"
        }
    }
    if (Test-Path -LiteralPath $registryPath) { Remove-Item -LiteralPath $registryPath }
    exit 0
}

if (-not (Test-Path -LiteralPath (Join-Path $dataRoot 'report-2026-09.json'))) {
    throw '未找到9月数据快照，请先完成只读导入。'
}
$pythonPath = (Get-Command python.exe -ErrorAction Stop).Source
$indexPath = Join-Path $frontendRoot 'dist/index.html'
$buildInputs = @(Get-ChildItem -LiteralPath (Join-Path $frontendRoot 'src') -File -Recurse)
$buildInputs += Get-Item -LiteralPath (Join-Path $frontendRoot 'package.json'), (Join-Path $frontendRoot 'package-lock.json'), (Join-Path $frontendRoot 'vite.config.ts'), (Join-Path $frontendRoot 'index.html')
$latestInput = ($buildInputs | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1).LastWriteTimeUtc
if (-not (Test-Path -LiteralPath $indexPath) -or (Get-Item -LiteralPath $indexPath).LastWriteTimeUtc -lt $latestInput) {
    Write-Host '正在构建本机报告页面，不安装依赖。'
    Push-Location $frontendRoot
    try {
        & npm run build
        if ($LASTEXITCODE -ne 0) { throw '前端构建失败，未启动新服务。' }
    } finally { Pop-Location }
}
Write-Host '正在检查预生成报告；新版本首次生成需要等待，之后启动直接复用。'
Push-Location $backendRoot
try {
    & $pythonPath -X utf8 -m app.services.prepare_reports --data-dir $dataRoot
    if ($LASTEXITCODE -ne 0) { throw '报告结果准备失败，未启动新服务。' }
} finally { Pop-Location }
New-Item -ItemType Directory -Path $runRoot -Force | Out-Null
$definitions = @(
    @{ name = 'backend'; port = 5187; executable = $pythonPath; folder = $backendRoot;
       arguments = "-m uvicorn app.main:app --app-dir `"$backendRoot`" --host 127.0.0.1 --port 5187" },
    @{ name = 'frontend'; port = 5186; executable = $pythonPath; folder = $backendRoot;
       arguments = "-m uvicorn app.web:app --app-dir `"$backendRoot`" --host 127.0.0.1 --port 5186" }
)

foreach ($definition in $definitions) {
    $existing = $services | Where-Object { $_.name -eq $definition.name } | Select-Object -First 1
    if ($existing -and (Get-OwnedProcess $existing)) {
        Write-Host "已在运行：$($definition.name)"
        continue
    }
    if (Get-NetTCPConnection -LocalPort $definition.port -State Listen -ErrorAction SilentlyContinue) {
        throw "端口$($definition.port)已被其他进程占用，未关闭该进程。"
    }
    $process = Start-Process -FilePath $definition.executable -ArgumentList $definition.arguments `
        -WorkingDirectory $definition.folder -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $runRoot "$($definition.name)-out.log") `
        -RedirectStandardError (Join-Path $runRoot "$($definition.name)-error.log")
    $services = @($services | Where-Object { $_.name -ne $definition.name })
    $services += @{ name = $definition.name; id = $process.Id }
    ConvertTo-Json -InputObject $services | Set-Content -LiteralPath $registryPath -Encoding UTF8
    Write-Host "已启动：$($definition.name)，PID $($process.Id)"
}

$ready = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    try {
        $null = Invoke-WebRequest -Uri 'http://127.0.0.1:5187/api/health' -UseBasicParsing -TimeoutSec 1
        $null = Invoke-WebRequest -Uri $reportUrl -UseBasicParsing -TimeoutSec 1
        $ready = $true
        break
    } catch { Start-Sleep -Milliseconds 500 }
}
if (-not $ready) { throw "服务尚未就绪，请检查$runRoot下的错误日志。" }
Write-Host "报告地址：$reportUrl"
Write-Host '关闭浏览器不会停止服务；请双击“停止报告.cmd”。常用报告已预生成，首次使用新筛选组合后也会保存结果。'
if (-not $NoBrowser) { Start-Process $reportUrl }
