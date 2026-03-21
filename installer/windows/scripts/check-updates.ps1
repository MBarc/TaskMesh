# TaskMesh Auto-Updater
# Scheduled weekly via Task Scheduler, or triggered on-demand via schtasks /Run.
# Checks the GitHub Releases API for a newer version and silently installs it.
#
# Parameters:
#   -Force : Skip the AutoUpdateEnabled registry guard.
#             Always set for the on-demand TaskMesh-ApplyUpdate task so that
#             the user can manually update even when auto-updates are disabled.

param([switch]$Force)

$ErrorActionPreference = "SilentlyContinue"

# ── Read registry first so the log path matches the actual installation dir ──
$regPath          = "HKLM:\Software\TaskMesh"
$regProps         = Get-ItemProperty -Path $regPath -ErrorAction SilentlyContinue
$installedVersion = $regProps.Version
$installDir       = $regProps.InstallDir
$dataDir          = $regProps.DataDir

# ── File logging — uses Add-Content, which works in Session 0 / no-console hosts ──
# Start-Transcript requires a console host and silently fails when spawned from a
# Windows service (Session 0). Add-Content always works.
$_logDir  = if ($installDir) { Join-Path $installDir "logs" } else { "C:\Windows\Temp" }
if (-not (Test-Path $_logDir)) { New-Item -ItemType Directory -Force -Path $_logDir | Out-Null }
$_logFile = Join-Path $_logDir "updater.log"
# Also write to Windows\Temp so we always have a log regardless of ACLs
$_logFileAlt = "C:\Windows\Temp\taskmesh-updater.log"

function Write-Log {
    param([string]$Message, [string]$EntryType = "Information", [int]$EventId = 1)
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') [$EntryType] $Message"
    try { Add-Content -Path $_logFile -Value $line -ErrorAction Stop } catch {}
    try { Add-Content -Path $_logFileAlt -Value $line -ErrorAction Stop } catch {}
    try {
        Write-EventLog -LogName Application -Source "TaskMesh" -EventId $EventId `
            -EntryType $EntryType -Message $Message -ErrorAction SilentlyContinue
    } catch {}
}

Write-Log "=== TaskMesh Updater started ==="

# Ensure event source is registered (requires elevation once).
# SourceExists() is a .NET call — wrap in try/catch so a stopped or inaccessible
# Event Log service does not terminate the script.
try {
    if (-not [System.Diagnostics.EventLog]::SourceExists("TaskMesh")) {
        try { New-EventLog -LogName Application -Source "TaskMesh" -ErrorAction Stop } catch {}
    }
} catch {}

if (-not $installedVersion) {
    Write-Log "TaskMesh update check: could not read installed version from registry. Aborting." "Warning" 2
    exit 1
}

# Respect the in-app auto-update toggle (stored in registry by install-services.ps1 / the settings API).
# Value '0' means the user disabled auto-update from within the app — exit cleanly so the weekly
# scheduled task is a no-op until they re-enable it.
# -Force bypasses this guard for on-demand updates triggered by the user via the UI.
$autoUpdateEnabled = $regProps.AutoUpdateEnabled
if ($autoUpdateEnabled -eq '0' -and -not $Force) {
    Write-Log "Auto-update is disabled in app settings. Exiting."
    exit 0
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

Write-Log "TaskMesh update available: $installedVersion -> $latestVersion. Downloading installer..." "Information" 5

# ── Find the installer asset ─────────────────────────────────────────────────
$asset = $response.assets | Where-Object { $_.name -eq "TaskMesh-Setup.exe" } | Select-Object -First 1

if (-not $asset) {
    Write-Log "TaskMesh update check: no TaskMesh-Setup.exe asset found in release $latestTag." "Warning" 6
    exit 1
}

$downloadUrl = $asset.browser_download_url

# ── Download to a temp file ───────────────────────────────────────────────────
$tempDir       = [System.IO.Path]::GetTempPath()
$installerPath = Join-Path $tempDir "TaskMesh-Setup-$latestVersion.exe"

Write-Log "Downloading $downloadUrl to $installerPath..."

try {
    Invoke-WebRequest -Uri $downloadUrl -OutFile $installerPath -UseBasicParsing -ErrorAction Stop
} catch {
    Write-Log "TaskMesh update check: download failed. $_" "Error" 7
    exit 1
}

Write-Log "Download complete. Stopping TaskMesh-Server before install..." "Information" 8

# ── Stop the TaskMesh service before running the installer ────────────────────
# The service must be stopped here (before the installer launches) so that
# node.exe releases its file handles and the installer can overwrite the binaries.
$nssmExe = if ($installDir) { Join-Path $installDir "nssm\nssm.exe" } else { $null }
if ($nssmExe -and (Test-Path $nssmExe)) {
    Write-Log "Stopping TaskMesh-Server via NSSM..." "Information" 8
    & $nssmExe stop TaskMesh-Server confirm 2>$null
} else {
    Write-Log "Stopping TaskMesh-Server via sc.exe..." "Information" 8
    & sc.exe stop TaskMesh-Server 2>$null
}
# Wait for node.exe to fully release its file handles before the installer runs.
Start-Sleep -Seconds 5

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

# Preserve the user's auto-update preference across updates.
# Without this, the installer defaults to /AUTOUPDATE=1 and would silently
# re-enable auto-update for users who had turned it off in Settings.
$autoUpdateVal = if ($regProps.AutoUpdateEnabled -eq '0') { '0' } else { '1' }
$installArgs += "/AUTOUPDATE=$autoUpdateVal"

Write-Log "Running silent install with args: $($installArgs -join ' ')..." "Information" 8

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

Write-Log "Installer exited with code $exitCode." "Information" 10

if ($exitCode -eq 0) {
    Write-Log "TaskMesh successfully updated to $latestVersion." "Information" 10
} else {
    Write-Log "TaskMesh installer exited with code $exitCode. Update may have failed." "Warning" 11
    exit $exitCode
}
