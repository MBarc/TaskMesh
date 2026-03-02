$nssm = 'C:\Program Files\TaskMesh\nssm\nssm.exe'

Write-Host "=== NSSM version ==="
cmd /c "`"$nssm`" version"
Write-Host "exit: $LASTEXITCODE"

Write-Host ""
Write-Host "=== Trying nssm install (will fail without admin, tells us the exact error) ==="
cmd /c "`"$nssm`" install TaskMesh-TestSvc `"C:\Windows\System32\cmd.exe`""
Write-Host "install exit: $LASTEXITCODE"

# Immediately remove test service if it was created
cmd /c "`"$nssm`" remove TaskMesh-TestSvc confirm" 2>$null
