# TaskMesh Auto-Updater
# Scheduled weekly via Task Scheduler.
# Checks the GitHub Releases API for a newer version and silently installs it.

$ErrorActionPreference = "SilentlyContinue"

$source  = "TaskMesh"
$logName = "Application"

# Ensure event source is registered (requires elevation once)
if (-not [System.Diagnostics.EventLog]::SourceExists($source)) {
    try { New-EventLog -LogName $logName -Source $source -ErrorAction Stop } catch {}
}

function Write-Log {
    param([string]$Message, [string]$EntryType = "Information", [int]$EventId = 1)
    Write-EventLog -LogName $logName -Source $source -EventId $EventId `
        -EntryType $EntryType -Message $Message -ErrorAction SilentlyContinue
    Write-Host $Message
}

# ── Read installed version from registry ────────────────────────────────────
$regPath         = "HKLM:\Software\TaskMesh"
$installedVersion = (Get-ItemProperty -Path $regPath -Name "Version" -ErrorAction SilentlyContinue).Version
$installDir       = (Get-ItemProperty -Path $regPath -Name "InstallDir" -ErrorAction SilentlyContinue).InstallDir
$dataDir          = (Get-ItemProperty -Path $regPath -Name "DataDir" -ErrorAction SilentlyContinue).DataDir

if (-not $installedVersion) {
    Write-Log "TaskMesh update check: could not read installed version from registry. Aborting." "Warning" 2
    exit 1
}

# ── Query GitHub Releases API ────────────────────────────────────────────────
$apiUrl = "https://api.github.com/repos/MBarc/TaskMesh/releases/latest"

try {
    $response = Invoke-RestMethod -Uri $apiUrl -UseBasicParsing `
        -Headers @{ "User-Agent" = "TaskMesh-Updater/$installedVersion" } `
        -ErrorAction Stop
} catch {
    Write-Log "TaskMesh update check failed: could not reach GitHub API. $_" "Warning" 3
    exit 1
}

$latestTag     = $response.tag_name          # e.g. "v1.2.0"
$latestVersion = $latestTag.TrimStart("v")   # e.g. "1.2.0"

Write-Log "TaskMesh update check: installed=$installedVersion latest=$latestVersion"

# ── Compare versions ─────────────────────────────────────────────────────────
try {
    $installed = [System.Version]$installedVersion
    $latest    = [System.Version]$latestVersion
} catch {
    Write-Log "TaskMesh update check: version parse error (installed='$installedVersion' latest='$latestVersion'). $_" "Warning" 4
    exit 1
}

if ($latest -le $installed) {
    Write-Log "TaskMesh is up to date ($installedVersion)."
    exit 0
}

Write-Log "TaskMesh update available: $installedVersion → $latestVersion. Downloading installer…" "Information" 5

# ── Find the installer asset ─────────────────────────────────────────────────
$asset = $response.assets | Where-Object { $_.name -eq "TaskMesh-Setup.exe" } | Select-Object -First 1

if (-not $asset) {
    Write-Log "TaskMesh update check: no TaskMesh-Setup.exe asset found in release $latestTag." "Warning" 6
    exit 1
}

$downloadUrl = $asset.browser_download_url

# ── Download to a temp file ───────────────────────────────────────────────────
$tempDir      = [System.IO.Path]::GetTempPath()
$installerPath = Join-Path $tempDir "TaskMesh-Setup-$latestVersion.exe"

try {
    Invoke-WebRequest -Uri $downloadUrl -OutFile $installerPath -UseBasicParsing -ErrorAction Stop
} catch {
    Write-Log "TaskMesh update check: download failed. $_" "Error" 7
    exit 1
}

Write-Log "TaskMesh update downloaded to $installerPath. Running silent install…" "Information" 8

# ── Build silent install arguments ────────────────────────────────────────────
# Re-use the existing install dir and data dir so the update is in-place.
$installArgs = @(
    "/QUIET"
    "/VERYSILENT"
    "/SUPPRESSMSGBOXES"
    "/NORESTART"
)

if ($installDir) { $installArgs += "/DIR=`"$installDir`"" }
if ($dataDir)    { $installArgs += "/DATADIR=`"$dataDir`"" }

# ── Launch installer and wait ─────────────────────────────────────────────────
try {
    $proc = Start-Process -FilePath $installerPath -ArgumentList $installArgs `
        -Wait -PassThru -ErrorAction Stop
    $exitCode = $proc.ExitCode
} catch {
    Write-Log "TaskMesh update check: failed to launch installer. $_" "Error" 9
    Remove-Item $installerPath -Force -ErrorAction SilentlyContinue
    exit 1
}

# Clean up temp file
Remove-Item $installerPath -Force -ErrorAction SilentlyContinue

if ($exitCode -eq 0) {
    Write-Log "TaskMesh successfully updated to $latestVersion (exit code $exitCode)." "Information" 10
} else {
    Write-Log "TaskMesh installer exited with code $exitCode. Update may have failed." "Warning" 11
    exit $exitCode
}
