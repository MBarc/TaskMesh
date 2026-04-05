# TaskMesh AI Component Installer
# Downloads Ollama, registers it as a service, pulls the LLM model,
# then installs the TaskMesh-AI service.
#
# Runs in a VISIBLE window so the user can see download progress.
# Called by the Inno Setup [Run] section (AI component only).
#
# Parameters:
#   -AppDir      : installation directory  e.g. C:\Program Files\TaskMesh
#   -OllamaModel : Ollama model to pull    (default: auto-detected via detect-hardware.ps1)

param(
    [Parameter(Mandatory)][string]$AppDir,
    [string]$OllamaModel = ""   # empty = auto-detect via detect-hardware.ps1
)

$ErrorActionPreference = "Stop"

# ── Helpers (defined first so they're available everywhere in the script) ──────

# Run any executable fully hidden: CREATE_NO_WINDOW + redirected stdout/stderr.
# Prevents console window flashes when this script is launched by ps-launcher.exe
# (which has no console). Without this, child console apps would call AllocConsole()
# and create a visible window on Windows 11 + Windows Terminal.
function Invoke-Hidden {
    param([string]$Exe, [string[]]$ExeArgs)
    $argStr = ($ExeArgs | ForEach-Object {
        if ($_ -match '[\s"]') { '"' + $_.Replace('"', '\"') + '"' } else { $_ }
    }) -join ' '
    $psi = [System.Diagnostics.ProcessStartInfo]::new($Exe)
    $psi.Arguments              = $argStr
    $psi.CreateNoWindow         = $true
    $psi.UseShellExecute        = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError  = $true
    $p   = [System.Diagnostics.Process]::Start($psi)
    $outTask = $p.StandardOutput.ReadToEndAsync()
    $errTask = $p.StandardError.ReadToEndAsync()
    $p.WaitForExit()
    $out = ($outTask.GetAwaiter().GetResult() + $errTask.GetAwaiter().GetResult()).Trim()
    return [PSCustomObject]@{ Output = $out; ExitCode = $p.ExitCode }
}

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

    $r = Invoke-Hidden -Exe $nssm -ExeArgs @("status", $Name)
    if ($r.ExitCode -eq 0) {
        Write-Host "Removing existing service: $Name"
        Invoke-Hidden -Exe $nssm -ExeArgs @("stop",   $Name, "confirm") | Out-Null
        Invoke-Hidden -Exe $nssm -ExeArgs @("remove", $Name, "confirm") | Out-Null
    }

    Write-Host "Installing service: $Name"
    $installArgs = @("install", $Name, $Executable)
    if ($Arguments) { $installArgs += $Arguments }
    Invoke-Hidden -Exe $nssm -ExeArgs $installArgs | Out-Null

    Invoke-Hidden -Exe $nssm -ExeArgs @("set", $Name, "AppDirectory",   $WorkDir)            | Out-Null
    Invoke-Hidden -Exe $nssm -ExeArgs @("set", $Name, "DisplayName",    "TaskMesh - $Name")  | Out-Null
    Invoke-Hidden -Exe $nssm -ExeArgs @("set", $Name, "Description",    "TaskMesh component: $Name") | Out-Null
    Invoke-Hidden -Exe $nssm -ExeArgs @("set", $Name, "Start",          "SERVICE_AUTO_START") | Out-Null
    Invoke-Hidden -Exe $nssm -ExeArgs @("set", $Name, "AppStdout",      (Join-Path $logDir "$Name-stdout.log")) | Out-Null
    Invoke-Hidden -Exe $nssm -ExeArgs @("set", $Name, "AppStderr",      (Join-Path $logDir "$Name-stderr.log")) | Out-Null
    Invoke-Hidden -Exe $nssm -ExeArgs @("set", $Name, "AppRotateFiles", "1")       | Out-Null
    Invoke-Hidden -Exe $nssm -ExeArgs @("set", $Name, "AppRotateBytes", "5242880") | Out-Null

    if ($EnvVars.Count -gt 0) {
        $envArray   = $EnvVars.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }
        $svcRegPath = "HKLM:\SYSTEM\CurrentControlSet\Services\$Name\Parameters"
        if (-not (Test-Path $svcRegPath)) { New-Item -Path $svcRegPath -Force | Out-Null }
        Set-ItemProperty -Path $svcRegPath -Name "AppEnvironmentExtra" `
            -Value $envArray -Type MultiString
    }
}

# ── Step 0: Detect hardware and select Ollama model ──────────────
Write-Step "Detecting hardware for AI model selection"

$scriptDir     = Split-Path -Parent $MyInvocation.MyCommand.Path
$detectScript  = Join-Path $scriptDir "detect-hardware.ps1"

if ($OllamaModel -eq "") {
    if (Test-Path $detectScript) {
        $r = Invoke-Hidden -Exe "powershell.exe" -ExeArgs @("-NonInteractive", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $detectScript)
        $OllamaModel = $r.Output.Trim()
        Write-Host "Hardware detection selected model: $OllamaModel"
    } else {
        Write-Warning "detect-hardware.ps1 not found -- using default: llama3.1:8b"
        $OllamaModel = "llama3.1:8b"
    }
} else {
    Write-Host "Using specified model: $OllamaModel"
}

if ($OllamaModel -eq "disabled") {
    Write-Host ""
    Write-Host "WARNING: Your system has less than 8 GB of RAM." -ForegroundColor Yellow
    Write-Host "         AI features require at least 8 GB RAM and will not be installed." -ForegroundColor Yellow
    Write-Host "         You can enable them later by upgrading your hardware and" -ForegroundColor Yellow
    Write-Host "         re-running the AI setup from the TaskMesh settings panel." -ForegroundColor Yellow
    Write-Host ""
    exit 0
}

Write-Host "Selected model: $OllamaModel" -ForegroundColor Cyan

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
    Write-Host "(This is approximately 500 MB -- please wait)" -ForegroundColor Yellow
    $ollamaSetup = Join-Path $env:TEMP "OllamaSetup.exe"
    Invoke-WebRequest -Uri "https://ollama.com/download/OllamaSetup.exe" `
        -OutFile $ollamaSetup -UseBasicParsing -TimeoutSec 600

    Write-Host "Installing Ollama..."
    Invoke-Hidden -Exe $ollamaSetup -ExeArgs @("/VERYSILENT", "/NORESTART") | Out-Null

    foreach ($c in $candidates) {
        if (Test-Path $c) { $ollamaExe = $c; break }
    }
    if (-not $ollamaExe) {
        throw "Ollama installation failed -- executable not found after install."
    }
    Write-Host "Ollama installed." -ForegroundColor Green

    # Record that TaskMesh installed Ollama so the uninstaller can offer to remove it.
    $tmReg = "HKLM:\Software\TaskMesh"
    if (-not (Test-Path $tmReg)) { New-Item -Force -Path $tmReg | Out-Null }
    Set-ItemProperty -Path $tmReg -Name "InstalledOllama" -Value "1"
} else {
    Write-Host "Ollama already installed at: $ollamaExe" -ForegroundColor Green
    # Don't set InstalledOllama -- we didn't install it, so we shouldn't remove it.
}

# ── Step 2: Register Ollama as a Windows Service ─────────────────
Write-Step "Registering Ollama service"

$r = Invoke-Hidden -Exe $nssm -ExeArgs @("status", "TaskMesh-Ollama")
if ($r.ExitCode -eq 0) {
    Write-Host "Removing existing TaskMesh-Ollama service..."
    Invoke-Hidden -Exe $nssm -ExeArgs @("stop",   "TaskMesh-Ollama", "confirm") | Out-Null
    Invoke-Hidden -Exe $nssm -ExeArgs @("remove", "TaskMesh-Ollama", "confirm") | Out-Null
}

Invoke-Hidden -Exe $nssm -ExeArgs @("install", "TaskMesh-Ollama", $ollamaExe, "serve")      | Out-Null
Invoke-Hidden -Exe $nssm -ExeArgs @("set", "TaskMesh-Ollama", "DisplayName",    "TaskMesh - Ollama LLM")              | Out-Null
Invoke-Hidden -Exe $nssm -ExeArgs @("set", "TaskMesh-Ollama", "Description",    "Local LLM backend for TaskMesh AI features") | Out-Null
Invoke-Hidden -Exe $nssm -ExeArgs @("set", "TaskMesh-Ollama", "Start",          "SERVICE_AUTO_START")                 | Out-Null
Invoke-Hidden -Exe $nssm -ExeArgs @("set", "TaskMesh-Ollama", "AppStdout",      (Join-Path $logDir "TaskMesh-Ollama-stdout.log")) | Out-Null
Invoke-Hidden -Exe $nssm -ExeArgs @("set", "TaskMesh-Ollama", "AppStderr",      (Join-Path $logDir "TaskMesh-Ollama-stderr.log")) | Out-Null
Invoke-Hidden -Exe $nssm -ExeArgs @("set", "TaskMesh-Ollama", "AppRotateFiles", "1")        | Out-Null
Invoke-Hidden -Exe $nssm -ExeArgs @("set", "TaskMesh-Ollama", "AppRotateBytes", "5242880")  | Out-Null

$ollamaRegPath = "HKLM:\SYSTEM\CurrentControlSet\Services\TaskMesh-Ollama\Parameters"
if (-not (Test-Path $ollamaRegPath)) { New-Item -Path $ollamaRegPath -Force | Out-Null }
Set-ItemProperty -Path $ollamaRegPath -Name "AppEnvironmentExtra" `
    -Value @("OLLAMA_HOST=127.0.0.1:11434") -Type MultiString

Invoke-Hidden -Exe $nssm -ExeArgs @("start", "TaskMesh-Ollama") | Out-Null
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
    Write-Warning "Ollama did not respond after 60 s -- cannot pull model."
    Write-Warning "AI features will not be available. You can re-run AI setup from the TaskMesh settings panel once Ollama starts."
    exit 1
}

# ── Step 4: Pull AI language model ───────────────────────────────
# Tier order for fallback on pull failure (highest to lowest).
$allTiers   = @("qwen2.5:32b", "qwen2.5:14b", "llama3.1:8b", "llama3.2:3b")
$modelReady = $false

Write-Step "Downloading AI language model: $OllamaModel"
Write-Host "(This may be 2–20 GB depending on the model -- please wait)" -ForegroundColor Yellow
Write-Host ""

& $ollamaExe pull $OllamaModel
if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "Model '$OllamaModel' ready." -ForegroundColor Green
    $modelReady = $true
} else {
    Write-Warning "Model pull failed for '$OllamaModel'."

    # Find this tier in the list and try the next one down.
    $tierIdx = [array]::IndexOf($allTiers, $OllamaModel)
    if ($tierIdx -ge 0 -and $tierIdx -lt ($allTiers.Length - 1)) {
        $fallback = $allTiers[$tierIdx + 1]
        Write-Host "Retrying with fallback model: $fallback" -ForegroundColor Yellow
        Write-Host ""
        & $ollamaExe pull $fallback
        if ($LASTEXITCODE -eq 0) {
            $OllamaModel = $fallback
            Write-Host ""
            Write-Host "Model '$OllamaModel' ready (fallback)." -ForegroundColor Green
            $modelReady = $true
        } else {
            Write-Warning "Fallback model pull also failed."
        }
    }

    if (-not $modelReady) {
        Write-Warning "AI language features will not work until a model is downloaded."
        Write-Warning "Retry later by running: ollama pull $OllamaModel"
    }
}

# ── Step 5: Install TaskMesh-AI service ──────────────────────────
Write-Step "Registering TaskMesh-AI service"

if (-not $modelReady) {
    Write-Warning "Skipping TaskMesh-AI service -- model was not downloaded successfully."
    Write-Warning "Re-run 'ollama pull $OllamaModel' then restart the TaskMesh-AI service to enable AI features."
} else {

$aiExe = Join-Path $AppDir "ai-service\ai-service.exe"
if (-not (Test-Path $aiExe)) {
    Write-Warning "AI service executable not found at $aiExe -- skipping service registration."
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

    Invoke-Hidden -Exe $nssm -ExeArgs @("start", "TaskMesh-AI") | Out-Null
    Write-Host "TaskMesh-AI service started." -ForegroundColor Green
    Write-Host "(Whisper transcription model downloads on first use)"
}

} # end modelReady block

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host "  AI components installed successfully." -ForegroundColor Green
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host ""
