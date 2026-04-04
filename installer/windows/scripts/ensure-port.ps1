# TaskMesh Port Assurance
# Called by start-taskmesh.bat before starting the server service.
# If the configured port is free, does nothing.
# If the port is taken, finds the next free port and updates both the
# NSSM service environment and the registry so the new port is used.

$ErrorActionPreference = "SilentlyContinue"

$storedPort = [int](Get-ItemProperty 'HKLM:\Software\TaskMesh' Port).Port
if (-not $storedPort) { $storedPort = 4000 }

function Find-FreePort([int]$Start) {
    $p = $Start
    while ($p -le 65535) {
        try {
            $l = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Any, $p)
            $l.Start()
            $l.Stop()
            return $p
        } catch { $p++ }
    }
    throw "No free port found from $Start"
}

function Set-ServicePort([int]$NewPort) {
    $svcReg = "HKLM:\SYSTEM\CurrentControlSet\Services\TaskMesh-Server\Parameters"
    if (-not (Test-Path $svcReg)) { New-Item -Path $svcReg -Force | Out-Null }
    $envVars = @()
    try { $envVars = (Get-ItemProperty $svcReg AppEnvironmentExtra).AppEnvironmentExtra } catch {}
    if ($envVars | Where-Object { $_ -like "PORT=*" }) {
        $envVars = $envVars | ForEach-Object { if ($_ -like "PORT=*") { "PORT=$NewPort" } else { $_ } }
    } else {
        $envVars += "PORT=$NewPort"
    }
    Set-ItemProperty $svcReg AppEnvironmentExtra $envVars -Type MultiString
    Set-ItemProperty 'HKLM:\Software\TaskMesh' Port $NewPort.ToString()
}

# If port 80 was unavailable at install time (stored port > 1024), opportunistically
# promote to port 80 now that it may have been freed (e.g. IIS stopped, reboot, etc.).
# This restores the clean http://taskmesh.localhost URL without a port suffix.
if ($storedPort -ne 80) {
    $port80Free = $false
    try {
        $l = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Any, 80)
        $l.Start()
        $l.Stop()
        $port80Free = $true
    } catch {}

    if ($port80Free) {
        Write-Host "[TaskMesh] Port 80 is now available — promoting from port $storedPort to port 80 (clean URL)." -ForegroundColor Green
        Set-ServicePort -NewPort 80
        exit 0
    }
}

# Check if the stored port is available
$portFree = $false
try {
    $l = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Any, $storedPort)
    $l.Start()
    $l.Stop()
    $portFree = $true
} catch {}

if ($portFree) { exit 0 }   # nothing to do

# Port is taken — find the next free one.
# If the stored port was privileged (e.g. 80), fall back to 4000+ rather than
# searching 81, 82... which aren't useful for the taskmesh.localhost hostname.
if ($storedPort -lt 1024) {
    $newPort = Find-FreePort -Start 4000
} else {
    $newPort = Find-FreePort -Start ($storedPort + 1)
}
Write-Host "[TaskMesh] Port $storedPort is in use — switching to port $newPort." -ForegroundColor Yellow
Set-ServicePort -NewPort $newPort
