# Test 1: Check file encoding (BOM)
$path = 'C:\Program Files\TaskMesh\scripts\install-services.ps1'
$bytes = [IO.File]::ReadAllBytes($path)
$bom = $bytes[0..3] | ForEach-Object { $_.ToString('X2') }
Write-Host "First 4 bytes (BOM check): $bom"

# Test 2: Count lines and show function definition line
$lines = Get-Content $path
Write-Host "Total lines: $($lines.Count)"
$funcLine = ($lines | Select-String 'function Install-NssmService' | Select-Object -First 1)
if ($funcLine) {
    Write-Host "Function found at line: $($funcLine.LineNumber)"
} else {
    Write-Host "WARNING: Function NOT found in file!"
}

# Test 3: Try dot-sourcing it in a clean scope and check if function exists
Write-Host ""
Write-Host "--- Testing dot-source ---"
try {
    . $path -AppDir 'DRYRUN' -DataDir 'DRYRUN' 2>&1 | Select-Object -First 5
} catch {
    Write-Host "Dot-source threw: $_"
}
if (Get-Command Install-NssmService -ErrorAction SilentlyContinue) {
    Write-Host "Install-NssmService IS available after dot-source"
} else {
    Write-Host "Install-NssmService NOT available after dot-source"
}

# Test 4: Run the script with dry-run params and capture all output
Write-Host ""
Write-Host "--- Running script (dry-run, will fail on nssm) ---"
$outFile = "$env:TEMP\taskmesh-install-test.txt"
powershell.exe -NonInteractive -ExecutionPolicy Bypass -File $path -AppDir 'C:\Program Files\TaskMesh' -DataDir "$env:USERPROFILE\Documents\TaskMesh" *> $outFile
Write-Host "Exit code: $LASTEXITCODE"
Write-Host "Output:"
Get-Content $outFile
