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
    [Parameter(Mandatory)][string]$DataDir,
    [string]$TelemetryEnabled = '0',
    [string]$AppVersion = '1.0.0'
)

# ── Helpers (defined first so they're available everywhere in the script) ──────

# Run any executable fully hidden: CREATE_NO_WINDOW + redirected stdout/stderr.
# PowerShell itself was launched by ps-launcher.exe with CREATE_NO_WINDOW and
# redirected pipes, so it has no console.  Without this helper, child console
# apps (nssm.exe, node.exe, sc.exe) would call AllocConsole() and create a
# visible window on Windows 11 + Windows Terminal.
function Invoke-Hidden {
    param([string]$Exe, [string[]]$ExeArgs, [string]$WorkingDirectory = '')
    $argStr = ($ExeArgs | ForEach-Object {
        if ($_ -match '[\s"]') { '"' + $_.Replace('"', '\"') + '"' } else { $_ }
    }) -join ' '
    $psi = [System.Diagnostics.ProcessStartInfo]::new($Exe)
    $psi.Arguments              = $argStr
    $psi.WorkingDirectory       = if ($WorkingDirectory) { $WorkingDirectory } else { (Get-Location).ProviderPath }
    $psi.CreateNoWindow         = $true
    $psi.UseShellExecute        = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError  = $true
    $p   = [System.Diagnostics.Process]::Start($psi)
    # Read async to avoid deadlock when both stdout and stderr produce output.
    $outTask = $p.StandardOutput.ReadToEndAsync()
    $errTask = $p.StandardError.ReadToEndAsync()
    $p.WaitForExit()
    $out = ($outTask.GetAwaiter().GetResult() + $errTask.GetAwaiter().GetResult()).Trim()
    return [PSCustomObject]@{ Output = $out; ExitCode = $p.ExitCode }
}

function Invoke-Nssm {
    param([string[]]$NssmArgs)
    Write-Host ("NSSM: nssm " + ($NssmArgs -join " "))
    $r = Invoke-Hidden -Exe $nssm -ExeArgs $NssmArgs
    if ($r.Output) { Write-Host ("  output: " + $r.Output) }
    Write-Host "  exit: $($r.ExitCode)"
    return $r.ExitCode
}

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

# Try port 80 first (enables http://taskmesh.localhost with no port suffix).
# Fall back to 4000+ if port 80 is unavailable (e.g. IIS occupies it).
$Port = $null
try {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, 80)
    $listener.Start()
    $listener.Stop()
    $Port = 80
    Write-Host "Port 80 is available -- using http://taskmesh.localhost"
} catch {
    Write-Host "Port 80 is not available -- falling back to 4000+"
    $Port = Find-FreePort -Start 4000
    if ($Port -ne 4000) {
        Write-Host "Port 4000 is in use -- using port $Port instead."
    }
}
Write-Host "Selected port: $Port"
$appUrl = if ($Port -eq 80) { "http://taskmesh.localhost" } else { "http://taskmesh.localhost:$Port" }
Write-Host "App URL: $appUrl"

# Add taskmesh.localhost to the OS hosts file (idempotent)
$hostsFile = "C:\Windows\System32\drivers\etc\hosts"
$hostsEntry = "127.0.0.1   taskmesh.localhost"
try {
    $hostsContent = Get-Content $hostsFile -Raw -ErrorAction Stop
    if ($hostsContent -match "taskmesh\.localhost") {
        Write-Host "taskmesh.localhost already in hosts file -- skipping."
    } else {
        Add-Content $hostsFile $hostsEntry
        Write-Host "Added taskmesh.localhost to hosts file."
    }
} catch {
    Write-Warning "Could not update hosts file: $_ (continuing)"
}

# Environment values
$env_DATABASE_URL            = "file:$dbFile"
$env_AI_SERVICE_URL          = "http://localhost:8000"
$env_PORT                    = "$Port"
$env_NODE_ENV                = "production"
$env_DOCUMENTATION_PATH      = Join-Path $DataDir "documentation"
$env_TELEMETRY_ENABLED       = if ($TelemetryEnabled -eq '1') { '1' } else { '0' }
$env_POSTHOG_API_KEY         = "phc_9lzpeA1FHtJ5eDcenDnZgNb9LarR3NCGCXC26PhzM2v"
$env_POSTHOG_HOST            = "https://us.i.posthog.com"

Write-Host "TelemetryEnabled: $env_TELEMETRY_ENABLED"

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
    Set-ItemProperty -Path $regPath -Name "AppUrl"  -Value $appUrl
    Set-ItemProperty -Path $regPath -Name "Version" -Value $AppVersion
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
    $prismaJs = Join-Path $AppDir "server\node_modules\prisma\build\index.js"
    $r = Invoke-Hidden -Exe $node -ExeArgs @($prismaJs, "db", "push", "--accept-data-loss")
    if ($r.Output) { Write-Host $r.Output }
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

# (Invoke-Hidden and Invoke-Nssm are defined at the top of the script)

# Install TaskMesh-Server service
Write-Host "Installing TaskMesh-Server service..."
$q = [char]34

# Unconditionally stop and remove any existing service before reinstalling.
# nssm status returns SERVICE_RUNNING (4) for a running service, not 0, so a
# conditional check on exit code == 0 would never fire.  Always stop first.
Write-Host "Stopping TaskMesh-Server (if running)..."
Invoke-Nssm @("stop",   "TaskMesh-Server", "confirm") | Out-Null
Invoke-Nssm @("remove", "TaskMesh-Server", "confirm") | Out-Null
Start-Sleep -Seconds 3   # Give Windows time to fully release the service name

try {

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
        "DOCUMENTATION_PATH=$env_DOCUMENTATION_PATH",
        "TASKMESH_TELEMETRY_ENABLED=$env_TELEMETRY_ENABLED",
        "POSTHOG_API_KEY=$env_POSTHOG_API_KEY",
        "POSTHOG_HOST=$env_POSTHOG_HOST"
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
        Invoke-Hidden -Exe "sc.exe" -ExeArgs @("stop",   "TaskMesh-Server") | Out-Null
        Invoke-Hidden -Exe "sc.exe" -ExeArgs @("delete", "TaskMesh-Server") | Out-Null
        Start-Sleep -Seconds 4

        Write-Host "Creating service with sc.exe..."
        $binPath = '"\"' + $node + '\" \"' + $server + '\""'
        $r = Invoke-Hidden -Exe "sc.exe" -ExeArgs @("create", "TaskMesh-Server", "binPath=", $binPath, "start=", "auto", "DisplayName=", "TaskMesh - Server")
        Write-Host "sc.exe create exit: $($r.ExitCode)"

        Invoke-Hidden -Exe "sc.exe" -ExeArgs @("description", "TaskMesh-Server", "TaskMesh Node.js server") | Out-Null
        Invoke-Hidden -Exe "sc.exe" -ExeArgs @("failure", "TaskMesh-Server", "reset=", "86400", "actions=", "restart/5000/restart/5000/restart/5000") | Out-Null

        # Set environment vars in service registry
        $envVars = @(
            "DATABASE_URL=$env_DATABASE_URL",
            "AI_SERVICE_URL=$env_AI_SERVICE_URL",
            "PORT=$env_PORT",
            "NODE_ENV=$env_NODE_ENV",
            "DOCUMENTATION_PATH=$env_DOCUMENTATION_PATH",
            "TASKMESH_TELEMETRY_ENABLED=$env_TELEMETRY_ENABLED",
            "POSTHOG_API_KEY=$env_POSTHOG_API_KEY",
            "POSTHOG_HOST=$env_POSTHOG_HOST"
        )
        $svcRoot = "HKLM:\SYSTEM\CurrentControlSet\Services\TaskMesh-Server"
        if (Test-Path $svcRoot) {
            Set-ItemProperty -Path $svcRoot -Name "Environment" -Value $envVars -Type MultiString
        }

        $r = Invoke-Hidden -Exe "sc.exe" -ExeArgs @("start", "TaskMesh-Server")
        Write-Host "sc.exe fallback: service started (exit $($r.ExitCode))"
    } catch {
        Write-Warning "sc.exe fallback also failed: $_"
    }
}

# Register scheduled tasks for auto-update (if stub present)
$updateScript = Join-Path $AppDir "updater\check-updates.ps1"
if (Test-Path $updateScript) {
    try {
        # Weekly automatic check (runs as the current logged-in user context)
        $weeklyName = "TaskMeshUpdateCheck"
        Unregister-ScheduledTask -TaskName $weeklyName -Confirm:$false -ErrorAction SilentlyContinue

        $weeklyAction   = New-ScheduledTaskAction -Execute "powershell.exe" `
                              -Argument ("-NonInteractive -NoProfile -ExecutionPolicy Bypass -File " + $q + $updateScript + $q)
        $weeklyTrigger  = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At "09:00"
        $weeklySettings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Hours 1)
        $weeklyPrincipal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

        Register-ScheduledTask -TaskName $weeklyName -Action $weeklyAction `
            -Trigger $weeklyTrigger -Settings $weeklySettings -Principal $weeklyPrincipal `
            -Description "TaskMesh weekly update check (runs as SYSTEM)" | Out-Null
        Write-Host "Weekly update check task registered."
    } catch {
        Write-Warning "Failed to register weekly update task: $_"
    }

    try {
        # On-demand trigger task — called by the Node.js server for manual in-app updates.
        # Must run as SYSTEM so the installer can overwrite files without UAC prompts.
        # The server triggers this with Start-ScheduledTask, which sends an RPC to the
        # Task Scheduler service and returns immediately — the task runs outside the
        # NSSM Job Object and survives the service shutdown that the update script triggers.
        $onDemandName      = "TaskMesh-ApplyUpdate"
        Unregister-ScheduledTask -TaskName $onDemandName -Confirm:$false -ErrorAction SilentlyContinue

        $onDemandAction    = New-ScheduledTaskAction -Execute "powershell.exe" `
                                -Argument ("-NonInteractive -NoProfile -ExecutionPolicy Bypass -File " + $q + $updateScript + $q)
        $onDemandPrincipal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
        $onDemandSettings  = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Hours 1) `
                                 -MultipleInstances IgnoreNew

        Register-ScheduledTask -TaskName $onDemandName -Action $onDemandAction `
            -Principal $onDemandPrincipal -Settings $onDemandSettings `
            -Description "TaskMesh on-demand updater - triggered by the server, runs as SYSTEM" | Out-Null
        Write-Host "On-demand update task ($onDemandName) registered as SYSTEM."
    } catch {
        Write-Warning "Failed to register on-demand update task: $_"
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
Write-Host "Server should be available at $appUrl"
Write-Host "Install log: $installLog"

try { Stop-Transcript | Out-Null } catch {}
