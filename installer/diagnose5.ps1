$svcPath = "HKLM:\SYSTEM\CurrentControlSet\Services\TaskMesh-Server"
Write-Host "Service registry:"
if (Test-Path $svcPath) {
    Get-ItemProperty $svcPath -ErrorAction SilentlyContinue
} else {
    Write-Host "NOT FOUND - service was never installed"
}

Write-Host "Port 4000:"
netstat -ano | Select-String ":4000 "

Write-Host "Log files:"
Get-ChildItem "C:\Program Files\TaskMesh\logs" -ErrorAction SilentlyContinue
