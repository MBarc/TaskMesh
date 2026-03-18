# TaskMesh Service Uninstaller
# Stops and removes all TaskMesh Windows Services and the update scheduled task.
# Called by the Inno Setup [UninstallRun] section.

param(
    [string]$AppDir = ""
)

$ErrorActionPreference = "SilentlyContinue"
$log = Join-Path $env:TEMP "taskmesh-uninstall.log"
function Log { param([string]$msg) "$(Get-Date -f 'HH:mm:ss'): $msg" | Out-File $log -Append }

# Resolve NSSM path — prefer the one passed via AppDir, fall back to registry
if (-not $AppDir) {
    $regPath = "HKLM:\Software\TaskMesh"
    if (Test-Path $regPath) {
        $AppDir = (Get-ItemProperty -Path $regPath -Name "AppDir" -ErrorAction SilentlyContinue).AppDir
    }
}

$nssm = if ($AppDir) { Join-Path $AppDir "nssm\nssm.exe" } else { $null }

Log "Script started. AppDir=$AppDir"

function Remove-NssmService {
    param([string]$Name)

    # Try NSSM first; fall back to sc.exe
    $stopped = $false
    if ($nssm -and (Test-Path $nssm)) {
        $status = & $nssm status $Name 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Stopping service: $Name"
            & $nssm stop   $Name confirm 2>&1 | Out-Null
            Write-Host "Removing service: $Name"
            & $nssm remove $Name confirm 2>&1 | Out-Null
            $stopped = $true
        }
    }

    if (-not $stopped) {
        $svc = Get-Service -Name $Name -ErrorAction SilentlyContinue
        if ($svc) {
            Write-Host "Stopping service (sc): $Name"
            Stop-Service -Name $Name -Force -ErrorAction SilentlyContinue
            & sc.exe delete $Name 2>&1 | Out-Null
        }
    }
}

Remove-NssmService "TaskMesh-Server"
Remove-NssmService "TaskMesh-AI"
Remove-NssmService "TaskMesh-Ollama"

# Remove scheduled task
$taskName = "TaskMeshUpdateCheck"
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
Write-Host "Removed scheduled task: $taskName"

# Remove startup registry entry
$runKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
Remove-ItemProperty -Path $runKey -Name "TaskMesh" -ErrorAction SilentlyContinue
Write-Host "Removed startup entry."

# Remove taskmesh.localhost from the OS hosts file
$hostsFile = "C:\Windows\System32\drivers\etc\hosts"
if (Test-Path $hostsFile) {
    $lines = Get-Content $hostsFile -ErrorAction SilentlyContinue
    if ($lines -match "taskmesh\.localhost") {
        $newLines = $lines | Where-Object { $_ -notmatch "taskmesh\.localhost" }
        Set-Content $hostsFile $newLines
        Log "Removed taskmesh.localhost from hosts file."
        Write-Host "Removed taskmesh.localhost from hosts file."
    }
}

Write-Host "TaskMesh services removed."

# Remove the +r flag set during install for the desktop.ini folder icon.
# Required before Remove-Item / Move-Item can succeed on the directory.
if ($AppDir -and (Test-Path $AppDir)) {
    try {
        $f = Get-Item -LiteralPath $AppDir -ErrorAction SilentlyContinue
        if ($f) { $f.Attributes = $f.Attributes -band (-bnot [System.IO.FileAttributes]::ReadOnly) }
    } catch {}
}

# Remove the install directory synchronously.
# Inno Setup 6 copies itself to %TEMP%\is-XXXX.tmp before executing, so
# unins000.exe inside {app} is NOT the running process and is not locked.
# All TaskMesh services were stopped above, so no other process holds files open.
# We therefore attempt a direct delete first.  If that fails (e.g. stale handle
# or attribute issue), we rename the directory into %TEMP% so it vanishes from
# Program Files immediately — before the uninstaller shows "done" — and let
# Windows TEMP cleanup or Inno's own self-deletion handle the remainder.
if ($AppDir -and (Test-Path $AppDir)) {
    try {
        Remove-Item -Path $AppDir -Recurse -Force -ErrorAction Stop
        Log "AppDir deleted: $AppDir"
        Write-Host "Install directory removed."
    } catch {
        Log "Direct delete failed ($_); renaming to TEMP so it leaves Program Files now."
        $tmpDir = Join-Path $env:TEMP "TaskMesh-removed-$(Get-Date -Format 'yyyyMMddHHmmss')"
        try {
            Move-Item -Path $AppDir -Destination $tmpDir -Force -ErrorAction Stop
            Log "AppDir moved to: $tmpDir (Inno/Windows TEMP cleanup will finish the rest)"
            Write-Host "Install directory moved to TEMP for cleanup."
        } catch {
            Log "Could not remove or move AppDir: $_"
        }
    }
}
