# TaskMesh Auto-Updater v1.0 (stub)
# Scheduled weekly via Task Scheduler. Full update logic coming in a future release.
# TODO: Poll https://taskmesh.co/api/version, compare with installed version,
#       download and run new installer silently if a newer version is available.

$ErrorActionPreference = "SilentlyContinue"

$source  = "TaskMesh"
$logName = "Application"

# Ensure event source is registered (requires elevation once)
if (-not [System.Diagnostics.EventLog]::SourceExists($source)) {
    try {
        New-EventLog -LogName $logName -Source $source -ErrorAction Stop
    } catch {
        # May fail without admin rights — continue silently
    }
}

# Read installed version from registry
$regPath         = "HKLM:\Software\TaskMesh"
$installedVersion = (Get-ItemProperty -Path $regPath -Name "Version" -ErrorAction SilentlyContinue).Version

$msg = "TaskMesh update check ran. Installed version: $installedVersion. (Full update logic not yet implemented.)"

Write-EventLog -LogName $logName -Source $source -EventId 1 `
    -EntryType Information -Message $msg -ErrorAction SilentlyContinue

Write-Host $msg
