$srcPath = 'C:\Users\micha\Desktop\TaskMesh\application\installer\scripts\install-services.ps1'
$errors = $null
$null = [System.Management.Automation.Language.Parser]::ParseFile(
    $srcPath,
    [ref]$null,
    [ref]$errors
)
if ($errors.Count -gt 0) {
    $errors | ForEach-Object { "Line $($_.Extent.StartLineNumber): $($_.Message)" }
} else {
    Write-Host "No parse errors found in install-services.ps1 (source)"
}
