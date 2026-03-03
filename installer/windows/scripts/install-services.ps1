# TaskMesh Core Service Installer
# Registers TaskMesh-Server as a Windows Service via NSSM.
# AI components are handled separately by install-ai.ps1.
# Called by the Inno Setup [Run] section after file extraction.
#
# Parameters:
#   -AppDir  : installation directory  e.g. C:\Program Files\TaskMesh
#   -DataDir : user data directory     e.g. C:\Users\Name\Documents\TaskMesh

param(
    [Parameter(Mandatory)][string]$AppDir,
    [Parameter(Mandatory)][string]$DataDir
)

# Ensure log directory exists and start transcript
$logDir = Join-Path $AppDir "logs"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Force -Path $logDir | Out-Null }
$installLog = Join-Path $logDir "install.log"
try { Start-Transcript -Path $installLog -Force | Out-Null } catch {}

$ErrorActionPreference = "Stop"

# Cancel any leftover directory-cleanup task from a previous uninstall cycle.
# Without this, reinstalling within ~10 minutes causes a blank PowerShell window
# to appear as the old cleanup task fires and retries deleting the fresh install.
Unregister-ScheduledTask -TaskName "TaskMeshDirCleanup" -Confirm:$false -ErrorAction SilentlyContinue

$principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
$isAdmin   = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

Write-Host "TaskMesh Install Script"
Write-Host "AppDir:  $AppDir"
Write-Host "DataDir: $DataDir"
Write-Host "Time:    $(Get-Date)"
Write-Host "IsAdmin: $isAdmin"

$nssm   = Join-Path $AppDir "nssm\nssm.exe"
$node   = Join-Path $AppDir "node\node.exe"
$server = Join-Path $AppDir "server\dist\index.js"
$dbFile = Join-Path $DataDir "taskmesh.db"

Write-Host "nssm exists:   $(Test-Path $nssm)"
Write-Host "node exists:   $(Test-Path $node)"
Write-Host "server exists: $(Test-Path $server)"

# Ensure directories exist
if (-not (Test-Path $DataDir)) { New-Item -ItemType Directory -Force -Path $DataDir | Out-Null }

# Auto-detect a free port starting from 4000.
# Uses Get-NetTCPConnection to enumerate all listening ports (catches 0.0.0.0,
# ::, and 127.0.0.1 bindings alike), then verifies with a TcpListener bind.
function Find-FreePort {
    param([int]$Start = 4000)
    $usedPorts = [System.Collections.Generic.HashSet[int]]::new()
    Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
        ForEach-Object { [void]$usedPorts.Add($_.LocalPort) }
    Write-Host "Ports in use near $Start : $(($usedPorts | Where-Object { $_ -ge $Start -and $_ -le ($Start+20) } | Sort-Object) -join ',')"
    $port = $Start
    while ($port -le 65535) {
        if (-not $usedPorts.Contains($port)) {
            try {
                $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $port)
                $listener.Start()
                $listener.Stop()
                return $port
            } catch {
                # bind failed despite not being in netstat -- try next
            }
        }
        $port++
    }
    throw "No available port found starting from $Start"
}

$Port = Find-FreePort -Start 4000
if ($Port -ne 4000) {
    Write-Host "Port 4000 is in use -- using port $Port instead."
}
Write-Host "Selected port: $Port"

# Environment values
$env_DATABASE_URL       = "file:$dbFile"
$env_AI_SERVICE_URL     = "http://localhost:8000"
$env_PORT               = "$Port"
$env_NODE_ENV           = "production"
$env_DOCUMENTATION_PATH = Join-Path $DataDir "documentation"

if (-not (Test-Path $env_DOCUMENTATION_PATH)) {
    New-Item -ItemType Directory -Force -Path $env_DOCUMENTATION_PATH | Out-Null
}

# Store config in registry
Write-Host "Writing registry config..."
try {
    $regPath = "HKLM:\Software\TaskMesh"
    if (-not (Test-Path $regPath)) { New-Item -Force -Path $regPath | Out-Null }
    Set-ItemProperty -Path $regPath -Name "AppDir"  -Value $AppDir
    Set-ItemProperty -Path $regPath -Name "DataDir" -Value $DataDir
    Set-ItemProperty -Path $regPath -Name "Port"    -Value "$Port"
    Set-ItemProperty -Path $regPath -Name "Version" -Value "1.0.0"
    Write-Host "Registry written OK."
} catch {
    Write-Warning "Registry write failed: $_ (continuing)"
}

# Initialize SQLite database via Prisma
Write-Host "Initializing database..."
$env:DATABASE_URL = $env_DATABASE_URL
$env:NODE_ENV     = $env_NODE_ENV
$savedLocation = Get-Location
try {
    Set-Location (Join-Path $AppDir "server")
    & $node (Join-Path $AppDir "server\node_modules\prisma\build\index.js") db push --accept-data-loss 2>&1 | Out-Null
    if (Test-Path $dbFile) {
        Write-Host "Database initialized at: $dbFile"
    } else {
        Write-Warning "Prisma ran but db file not found -- will init on first launch."
    }
} catch {
    Write-Warning "Database init failed: $_ -- will init on first launch."
} finally {
    Set-Location $savedLocation
}

# Helper: run NSSM with logging
# ErrorActionPreference is set to Continue inside this function so that NSSM's
# stderr output (e.g. "Can't open service!") does not become a TerminatingError.
function Invoke-Nssm {
    param([string[]]$NssmArgs)
    $ErrorActionPreference = "Continue"
    Write-Host ("NSSM: nssm " + ($NssmArgs -join " "))
    $out = & $nssm @NssmArgs 2>&1
    $code = $LASTEXITCODE
    if ($out) { Write-Host ("  output: " + ($out | Out-String)) }
    Write-Host "  exit: $code"
    return $code
}

# Install TaskMesh-Server service
Write-Host "Installing TaskMesh-Server service..."
$q = [char]34

try {
    # Remove existing service if present
    $statusCode = Invoke-Nssm @("status", "TaskMesh-Server")
    if ($statusCode -eq 0) {
        Write-Host "Removing existing service..."
        Invoke-Nssm @("stop",   "TaskMesh-Server", "confirm") | Out-Null
        Invoke-Nssm @("remove", "TaskMesh-Server", "confirm") | Out-Null
        Start-Sleep -Seconds 2
    }

    # Install with executable only (no script arg here).
    # AppParameters is written directly to the registry below to preserve the
    # quotes around the path -- PowerShell 5.1 strips outer double-quotes when
    # passing string values to external commands, which would split the path.
    $exitCode = Invoke-Nssm @("install", "TaskMesh-Server", $node)
    if ($exitCode -ne 0) {
        throw "nssm install returned exit code $exitCode"
    }

    # Configure service
    Invoke-Nssm @("set", "TaskMesh-Server", "AppDirectory",   (Join-Path $AppDir "server"))   | Out-Null
    Invoke-Nssm @("set", "TaskMesh-Server", "DisplayName",    "TaskMesh - Server")             | Out-Null
    Invoke-Nssm @("set", "TaskMesh-Server", "Description",    "TaskMesh Node.js server")       | Out-Null
    Invoke-Nssm @("set", "TaskMesh-Server", "Start",          "SERVICE_AUTO_START")             | Out-Null
    Invoke-Nssm @("set", "TaskMesh-Server", "AppStdout",      (Join-Path $logDir "TaskMesh-Server-stdout.log")) | Out-Null
    Invoke-Nssm @("set", "TaskMesh-Server", "AppStderr",      (Join-Path $logDir "TaskMesh-Server-stderr.log")) | Out-Null
    Invoke-Nssm @("set", "TaskMesh-Server", "AppRotateFiles", "1")       | Out-Null
    Invoke-Nssm @("set", "TaskMesh-Server", "AppRotateBytes", "5242880") | Out-Null

    # Write AppParameters directly to the registry so the JS path keeps its
    # surrounding quotes. PowerShell 5.1 strips outer double-quotes when
    # passing string values to external commands, which would split the path.
    $svcParamsPath = "HKLM:\SYSTEM\CurrentControlSet\Services\TaskMesh-Server\Parameters"
    $waited = 0
    while (-not (Test-Path $svcParamsPath) -and $waited -lt 5) {
        Start-Sleep -Seconds 1; $waited++
        Write-Host "Waiting for Parameters key ($waited s)..."
    }
    if (-not (Test-Path $svcParamsPath)) { New-Item -Path $svcParamsPath -Force | Out-Null }
    $appParamsValue = $q + $server + $q
    Set-ItemProperty -Path $svcParamsPath -Name "AppParameters" -Value $appParamsValue
    Write-Host "AppParameters written: $appParamsValue"

    # Write environment variables to the service registry (REG_MULTI_SZ)
    $envVars = @(
        "DATABASE_URL=$env_DATABASE_URL",
        "AI_SERVICE_URL=$env_AI_SERVICE_URL",
        "PORT=$env_PORT",
        "NODE_ENV=$env_NODE_ENV",
        "DOCUMENTATION_PATH=$env_DOCUMENTATION_PATH"
    )
    # $svcParamsPath is guaranteed to exist (created/verified above)
    Set-ItemProperty -Path $svcParamsPath -Name "AppEnvironmentExtra" -Value $envVars -Type MultiString
    Write-Host "Environment variables written to service registry."

    # Start the service
    Write-Host "Starting TaskMesh-Server..."
    $startCode = Invoke-Nssm @("start", "TaskMesh-Server")
    if ($startCode -eq 0) {
        Write-Host "TaskMesh-Server started successfully."
    } else {
        Write-Warning "nssm start returned $startCode -- service may need a moment to start."
    }

} catch {
    Write-Warning "NSSM service install failed: $_"
    Write-Warning "Attempting sc.exe fallback..."

    try {
        sc.exe stop   "TaskMesh-Server" 2>&1 | Out-Null
        sc.exe delete "TaskMesh-Server" 2>&1 | Out-Null
        Start-Sleep -Seconds 1

        Write-Host "Creating service with sc.exe..."
        # cmd /c ensures the binPath value (with embedded quotes and spaces) is
        # passed as a single correctly-escaped argument to sc.exe.
        $scCmd = 'sc create "TaskMesh-Server" binPath= "\"' + $node + '\" \"' + $server + '\"" start= auto DisplayName= "TaskMesh - Server"'
        cmd /c $scCmd
        Write-Host "sc.exe create exit: $LASTEXITCODE"

        sc.exe description "TaskMesh-Server" "TaskMesh Node.js server"
        sc.exe failure "TaskMesh-Server" reset= 86400 actions= restart/5000/restart/5000/restart/5000

        # Set environment vars in service registry
        $envVars = @(
            "DATABASE_URL=$env_DATABASE_URL",
            "AI_SERVICE_URL=$env_AI_SERVICE_URL",
            "PORT=$env_PORT",
            "NODE_ENV=$env_NODE_ENV",
            "DOCUMENTATION_PATH=$env_DOCUMENTATION_PATH"
        )
        $svcRoot = "HKLM:\SYSTEM\CurrentControlSet\Services\TaskMesh-Server"
        if (Test-Path $svcRoot) {
            Set-ItemProperty -Path $svcRoot -Name "Environment" -Value $envVars -Type MultiString
        }

        sc.exe start "TaskMesh-Server"
        Write-Host "sc.exe fallback: service started (exit $LASTEXITCODE)"
    } catch {
        Write-Warning "sc.exe fallback also failed: $_"
    }
}

# Register scheduled task for auto-update (if stub present)
$updateScript = Join-Path $AppDir "updater\check-updates.ps1"
if (Test-Path $updateScript) {
    try {
        $taskName = "TaskMeshUpdateCheck"
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

        $action   = New-ScheduledTaskAction -Execute "powershell.exe" `
                        -Argument ("-NonInteractive -WindowStyle Hidden -File " + $q + $updateScript + $q)
        $trigger  = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At "09:00"
        $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 5)

        Register-ScheduledTask -TaskName $taskName -Action $action `
            -Trigger $trigger -Settings $settings -RunLevel Highest `
            -Description "TaskMesh weekly update check" | Out-Null
        Write-Host "Scheduled update check task registered."
    } catch {
        Write-Warning "Failed to register scheduled task: $_"
    }
}

# Apply folder icon attributes so Explorer shows the TaskMesh logo on {app}.
# +r on the folder tells Explorer to read desktop.ini (NOT write-protection).
# +s +h on desktop.ini marks it system+hidden as Windows expects.
# Done here via .NET FileAttributes instead of spawning attrib.exe, which
# would create a brief console window flash right before the finish page.
try {
    $appItem = Get-Item -LiteralPath $AppDir -ErrorAction Stop
    $appItem.Attributes = $appItem.Attributes -bor [System.IO.FileAttributes]::ReadOnly
    $desktopIni = Join-Path $AppDir "desktop.ini"
    if (Test-Path $desktopIni) {
        $iniItem = Get-Item -LiteralPath $desktopIni -ErrorAction Stop
        $iniItem.Attributes = $iniItem.Attributes -bor [System.IO.FileAttributes]::System -bor [System.IO.FileAttributes]::Hidden
    }
    Write-Host "Folder icon attributes applied."
} catch {
    Write-Warning "Could not apply folder attributes: $_"
}

Write-Host ""
Write-Host "TaskMesh install script complete."
Write-Host "Server should be available at http://localhost:$Port"
Write-Host "Install log: $installLog"

try { Stop-Transcript | Out-Null } catch {}
