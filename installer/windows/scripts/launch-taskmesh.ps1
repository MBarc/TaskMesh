# TaskMesh silent launcher
# Starts TaskMesh services and opens the browser without showing a terminal window.
# Called by ps-launcher.exe, so this script already runs with no console window.
# Replaces the deprecated launch-taskmesh.vbs (wscript.exe / VBScript).
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$psi = [System.Diagnostics.ProcessStartInfo]::new('cmd.exe')
$psi.Arguments       = "/c `"$scriptDir\start-taskmesh.bat`""
$psi.UseShellExecute = $false
$psi.CreateNoWindow  = $true
[System.Diagnostics.Process]::Start($psi) | Out-Null
