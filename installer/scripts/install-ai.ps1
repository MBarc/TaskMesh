# TaskMesh AI Component Installer
# Downloads Ollama, registers it as a service, pulls the LLM model,
# then installs the TaskMesh-AI service.
#
# Runs in a VISIBLE window so the user can see download progress.
# Called by the Inno Setup [Run] section (AI component only).
#
# Parameters:
#   -AppDir      : installation directory  e.g. C:\Program Files\TaskMesh
#   -OllamaModel : Ollama model to pull    (default qwen2.5:3b)

param(
    [Parameter(Mandatory)][string]$AppDir,
    [string]$OllamaModel = "qwen2.5:3b"
)

$ErrorActionPreference = "Stop"

$nssm   = Join-Path $AppDir "nssm\nssm.exe"
$logDir = Join-Path $AppDir "logs"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Force -Path $logDir | Out-Null }

# Read port from registry (set by install-services.ps1)
$regPath = "HKLM:\Software\TaskMesh"
$Port = "8000"   # AI service always uses 8000

function Write-Step([string]$msg) {
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host "  $msg" -ForegroundColor Cyan
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
}

# ── Helper: install/reconfigure a single NSSM service ────────────
function Install-NssmService {
    param(
        [string]$Name,
        [string]$Executable,
        [string]$Arguments,
        [hashtable]$EnvVars,
        [string]$WorkDir
    )

    $existing = & $nssm status $Name 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Removing existing service: $Name"
        & $nssm stop   $Name confirm 2>&1 | Out-Null
        & $nssm remove $Name confirm 2>&1 | Out-Null
    }

    Write-Host "Installing service: $Name"
    & $nssm install $Name $Executable $Arguments

    & $nssm set $Name AppDirectory  $WorkDir
    & $nssm set $Name DisplayName   "TaskMesh - $Name"
    & $nssm set $Name Description   "TaskMesh component: $Name"
    & $nssm set $Name Start         SERVICE_AUTO_START
    & $nssm set $Name AppStdout     (Join-Path $logDir "$Name-stdout.log")
    & $nssm set $Name AppStderr     (Join-Path $logDir "$Name-stderr.log")
    & $nssm set $Name AppRotateFiles 1
    & $nssm set $Name AppRotateBytes 5242880

    if ($EnvVars.Count -gt 0) {
        $envArray   = $EnvVars.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }
        $svcRegPath = "HKLM:\SYSTEM\CurrentControlSet\Services\$Name\Parameters"
        if (-not (Test-Path $svcRegPath)) { New-Item -Path $svcRegPath -Force | Out-Null }
        Set-ItemProperty -Path $svcRegPath -Name "AppEnvironmentExtra" `
            -Value $envArray -Type MultiString
    }
}

# ── Step 1: Find or download Ollama ─────────────────────────────
Write-Step "Setting up Ollama AI engine"

$ollamaExe = $null
$candidates = @(
    "C:\Program Files\Ollama\ollama.exe",
    "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe"
)
foreach ($c in $candidates) {
    if (Test-Path $c) { $ollamaExe = $c; break }
}

if (-not $ollamaExe) {
    Write-Host "Downloading Ollama for Windows..."
    Write-Host "(This is approximately 500 MB — please wait)" -ForegroundColor Yellow
    $ollamaSetup = Join-Path $env:TEMP "OllamaSetup.exe"
    Invoke-WebRequest -Uri "https://ollama.com/download/OllamaSetup.exe" `
        -OutFile $ollamaSetup -UseBasicParsing -TimeoutSec 600

    Write-Host "Installing Ollama..."
    Start-Process -FilePath $ollamaSetup -ArgumentList "/VERYSILENT", "/NORESTART" -Wait

    foreach ($c in $candidates) {
        if (Test-Path $c) { $ollamaExe = $c; break }
    }
    if (-not $ollamaExe) {
        throw "Ollama installation failed — executable not found after install."
    }
    Write-Host "Ollama installed." -ForegroundColor Green

    # Record that TaskMesh installed Ollama so the uninstaller can offer to remove it.
    $tmReg = "HKLM:\Software\TaskMesh"
    if (-not (Test-Path $tmReg)) { New-Item -Force -Path $tmReg | Out-Null }
    Set-ItemProperty -Path $tmReg -Name "InstalledOllama" -Value "1"
} else {
    Write-Host "Ollama already installed at: $ollamaExe" -ForegroundColor Green
    # Don't set InstalledOllama — we didn't install it, so we shouldn't remove it.
}

# ── Step 2: Register Ollama as a Windows Service ─────────────────
Write-Step "Registering Ollama service"

$existing = & $nssm status "TaskMesh-Ollama" 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "Removing existing TaskMesh-Ollama service..."
    & $nssm stop   "TaskMesh-Ollama" confirm 2>&1 | Out-Null
    & $nssm remove "TaskMesh-Ollama" confirm 2>&1 | Out-Null
}

& $nssm install "TaskMesh-Ollama" $ollamaExe "serve"
& $nssm set "TaskMesh-Ollama" DisplayName    "TaskMesh - Ollama LLM"
& $nssm set "TaskMesh-Ollama" Description    "Local LLM backend for TaskMesh AI features"
& $nssm set "TaskMesh-Ollama" Start           SERVICE_AUTO_START
& $nssm set "TaskMesh-Ollama" AppStdout       (Join-Path $logDir "TaskMesh-Ollama-stdout.log")
& $nssm set "TaskMesh-Ollama" AppStderr       (Join-Path $logDir "TaskMesh-Ollama-stderr.log")
& $nssm set "TaskMesh-Ollama" AppRotateFiles  1
& $nssm set "TaskMesh-Ollama" AppRotateBytes  5242880

$ollamaRegPath = "HKLM:\SYSTEM\CurrentControlSet\Services\TaskMesh-Ollama\Parameters"
if (-not (Test-Path $ollamaRegPath)) { New-Item -Path $ollamaRegPath -Force | Out-Null }
Set-ItemProperty -Path $ollamaRegPath -Name "AppEnvironmentExtra" `
    -Value @("OLLAMA_HOST=127.0.0.1:11434") -Type MultiString

& $nssm start "TaskMesh-Ollama"
Write-Host "Ollama service started." -ForegroundColor Green

# ── Step 3: Wait for Ollama to be ready ──────────────────────────
Write-Host ""
Write-Host "Waiting for Ollama to be ready..."
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:11434" `
                 -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
        if ($r.StatusCode -eq 200) { $ready = $true; break }
    } catch {}
    Start-Sleep -Seconds 2
}

if (-not $ready) {
    Write-Warning "Ollama did not respond after 60 s. AI features may not work until it starts."
}

# ── Step 4: Pull AI language model ───────────────────────────────
Write-Step "Downloading AI language model: $OllamaModel"
Write-Host "(This is approximately 2 GB — please wait)" -ForegroundColor Yellow
Write-Host ""

$modelReady = $false
& $ollamaExe pull $OllamaModel
if ($LASTEXITCODE -ne 0) {
    Write-Warning "Model pull failed (exit code $LASTEXITCODE)."
    Write-Warning "AI language features will not work until the model is downloaded."
    Write-Warning "You can retry later by running: ollama pull $OllamaModel"
} else {
    Write-Host ""
    Write-Host "Model '$OllamaModel' ready." -ForegroundColor Green
    $modelReady = $true
}

# ── Step 5: Install TaskMesh-AI service ──────────────────────────
Write-Step "Registering TaskMesh-AI service"

if (-not $modelReady) {
    Write-Warning "Skipping TaskMesh-AI service — model was not downloaded successfully."
    Write-Warning "Re-run 'ollama pull $OllamaModel' then restart the TaskMesh-AI service to enable AI features."
} else {

$aiExe = Join-Path $AppDir "ai-service\ai-service.exe"
if (-not (Test-Path $aiExe)) {
    Write-Warning "AI service executable not found at $aiExe — skipping service registration."
} else {
    $whisperModelDir = Join-Path $AppDir "ai-service\models"
    New-Item -ItemType Directory -Force -Path $whisperModelDir | Out-Null

    $aiEnv = @{
        OLLAMA_HOST             = "http://localhost:11434"
        OLLAMA_MODEL            = $OllamaModel
        WHISPER_MODEL           = "tiny"
        WHISPER_MODEL_DIR       = $whisperModelDir
        TASKMESH_PRELOAD_MODELS = "1"
    }

    Install-NssmService `
        -Name       "TaskMesh-AI" `
        -Executable $aiExe `
        -Arguments  "" `
        -EnvVars    $aiEnv `
        -WorkDir    (Join-Path $AppDir "ai-service")

    & $nssm start "TaskMesh-AI"
    Write-Host "TaskMesh-AI service started." -ForegroundColor Green
    Write-Host "(Whisper transcription model downloads on first use)"
}

} # end modelReady block

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host "  AI components installed successfully." -ForegroundColor Green
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host ""
