# TaskMesh Ollama Uninstaller
# Locates the Ollama uninstaller via the Windows registry and runs it silently.
# Only called when the user chose to remove Ollama during TaskMesh uninstall.

$ErrorActionPreference = "SilentlyContinue"

$uninstallStr = $null

# Search both HKLM and HKCU (Ollama may be a per-user or system-wide install)
foreach ($hive in @("HKLM", "HKCU")) {
    foreach ($path in @(
        "${hive}:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
        "${hive}:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"
    )) {
        Get-ChildItem $path -ErrorAction SilentlyContinue | ForEach-Object {
            $props = Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue
            if ($props.DisplayName -like "*Ollama*" -and $props.UninstallString) {
                $uninstallStr = $props.UninstallString
            }
        }
        if ($uninstallStr) { break }
    }
    if ($uninstallStr) { break }
}

if (-not $uninstallStr) {
    Write-Warning "Ollama uninstaller not found in registry -- it may have already been removed."
    exit 0
}

Write-Host "Uninstalling Ollama..."

# UninstallString may be quoted (e.g. "C:\path\unins000.exe") -- parse the exe path
if ($uninstallStr -match '^"([^"]+)"') {
    $exe = $Matches[1]
} else {
    $exe = ($uninstallStr -split '\s')[0]
}

Start-Process -FilePath $exe -ArgumentList "/VERYSILENT", "/NORESTART" -Wait -ErrorAction Stop

Write-Host "Ollama removed." -ForegroundColor Green
