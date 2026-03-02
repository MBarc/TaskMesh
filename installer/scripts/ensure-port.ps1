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

# Check if the stored port is available
$portFree = $false
try {
    $l = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Any, $storedPort)
    $l.Start()
    $l.Stop()
    $portFree = $true
} catch {}

if ($portFree) { exit 0 }   # nothing to do

# Port is taken — find the next free one
$newPort = Find-FreePort -Start ($storedPort + 1)
Write-Host "[TaskMesh] Port $storedPort is in use — switching to port $newPort." -ForegroundColor Yellow

# Update the NSSM service environment (PORT= entry in AppEnvironmentExtra)
$svcReg = "HKLM:\SYSTEM\CurrentControlSet\Services\TaskMesh-Server\Parameters"
if (-not (Test-Path $svcReg)) { New-Item -Path $svcReg -Force | Out-Null }

$envVars = @()
try { $envVars = (Get-ItemProperty $svcReg AppEnvironmentExtra).AppEnvironmentExtra } catch {}

if ($envVars | Where-Object { $_ -like "PORT=*" }) {
    $envVars = $envVars | ForEach-Object { if ($_ -like "PORT=*") { "PORT=$newPort" } else { $_ } }
} else {
    $envVars += "PORT=$newPort"
}
Set-ItemProperty $svcReg AppEnvironmentExtra $envVars -Type MultiString

# Persist the new port so start-taskmesh.bat re-reads it
Set-ItemProperty 'HKLM:\Software\TaskMesh' Port $newPort.ToString()
