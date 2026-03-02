# Show hex dump of the function name bytes in the definition line
$path = 'C:\Program Files\TaskMesh\scripts\install-services.ps1'
$lines = [IO.File]::ReadAllLines($path)

Write-Host "=== Line 86 (function definition) ==="
$funcLine = $lines[85]  # 0-indexed
Write-Host "Raw: $funcLine"
$bytes = [System.Text.Encoding]::UTF8.GetBytes($funcLine)
Write-Host "Hex: $(($bytes | ForEach-Object { $_.ToString('X2') }) -join ' ')"

# Check if there's a call line and hex it too
$callLine = $null
for ($i = 125; $i -lt [Math]::Min($lines.Count, 145); $i++) {
    if ($lines[$i] -match 'Install-NssmService') {
        $callLine = $lines[$i]
        Write-Host ""
        Write-Host "=== Call at line $($i+1) ==="
        Write-Host "Raw: $callLine"
        $cbytes = [System.Text.Encoding]::UTF8.GetBytes($callLine)
        Write-Host "Hex: $(($cbytes | ForEach-Object { $_.ToString('X2') }) -join ' ')"
        break
    }
}

Write-Host ""
Write-Host "=== Tracing execution step by step ==="
Write-Host "Running script with REAL installed paths..."

# Add trace logging to understand where it stops
$traceScript = @'
$ErrorActionPreference = "Stop"
$AppDir  = 'C:\Program Files\TaskMesh'
$DataDir = "$env:USERPROFILE\Documents\TaskMesh"

Write-Host "TRACE: Variables defined"

$nssm   = Join-Path $AppDir "nssm\nssm.exe"
$node   = Join-Path $AppDir "node\node.exe"
$server = Join-Path $AppDir "server\dist\index.js"
$dbFile = Join-Path $DataDir "taskmesh.db"
$logDir = Join-Path $AppDir "logs"

Write-Host "TRACE: Paths: nssm=$nssm node=$node"
Write-Host "TRACE: nssm exists: $(Test-Path $nssm), node exists: $(Test-Path $node)"

if (-not (Test-Path $DataDir)) { New-Item -ItemType Directory -Force -Path $DataDir | Out-Null }
if (-not (Test-Path $logDir))  { New-Item -ItemType Directory -Force -Path $logDir  | Out-Null }

Write-Host "TRACE: Directories OK"

function Find-FreePort {
    param([int]$Start = 4000)
    $port = $Start
    while ($port -le 65535) {
        try {
            $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $port)
            $listener.Start()
            $listener.Stop()
            return $port
        } catch {
            $port++
        }
    }
    throw "No available port found starting from $Start"
}

$Port = Find-FreePort -Start 4000
Write-Host "TRACE: Port=$Port"

$env_DATABASE_URL       = "file:$dbFile"
$env_AI_SERVICE_URL     = "http://localhost:8000"
$env_PORT               = "$Port"
$env_NODE_ENV           = "production"
$env_DOCUMENTATION_PATH = Join-Path $DataDir "documentation"

if (-not (Test-Path $env_DOCUMENTATION_PATH)) {
    New-Item -ItemType Directory -Force -Path $env_DOCUMENTATION_PATH | Out-Null
}

Write-Host "TRACE: Env vars set"

$regPath = "HKLM:\Software\TaskMesh"
Write-Host "TRACE: About to write registry..."
try {
    if (-not (Test-Path $regPath)) { New-Item -Force -Path $regPath | Out-Null }
    Set-ItemProperty -Path $regPath -Name "AppDir"  -Value $AppDir
    Set-ItemProperty -Path $regPath -Name "DataDir" -Value $DataDir
    Set-ItemProperty -Path $regPath -Name "Port"    -Value "$Port"
    Set-ItemProperty -Path $regPath -Name "Version" -Value "1.0.0"
    Write-Host "TRACE: Registry written OK"
} catch {
    Write-Host "TRACE: Registry FAILED: $_"
}

Write-Host "TRACE: About to run Prisma..."
$env:DATABASE_URL = $env_DATABASE_URL
$env:NODE_ENV     = $env_NODE_ENV
Push-Location (Join-Path $AppDir "server")
try {
    & $node (Join-Path $AppDir "server\node_modules\prisma\build\index.js") db push --accept-data-loss 2>&1 | Out-Null
    Write-Host "TRACE: Prisma OK, db exists: $(Test-Path $dbFile)"
} catch {
    Write-Host "TRACE: Prisma failed (expected): $_"
}
Pop-Location

Write-Host "TRACE: About to define Install-NssmService function..."

function Install-NssmService {
    param(
        [string]$Name,
        [string]$Executable,
        [string]$Arguments,
        [hashtable]$EnvVars,
        [string]$WorkDir
    )
    Write-Host "TRACE: Install-NssmService called for $Name"
}

Write-Host "TRACE: Function defined. Calling it..."

Install-NssmService -Name "TEST" -Executable "test.exe" -Arguments "" -EnvVars @{} -WorkDir "C:\"

Write-Host "TRACE: All done!"
'@

$traceFile = "$env:TEMP\taskmesh-trace.ps1"
$traceScript | Out-File -Encoding UTF8 $traceFile

Write-Host "Running trace script as admin (elevated)..."
$result = powershell.exe -NonInteractive -ExecutionPolicy Bypass -File $traceFile 2>&1
$result | ForEach-Object { Write-Host $_ }
Write-Host "Exit: $LASTEXITCODE"
