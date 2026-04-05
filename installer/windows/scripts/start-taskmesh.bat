@echo off
:: TaskMesh Launch Wrapper
:: Ensures a free port, starts services if needed, then opens the browser.

:: Read install config from registry (PowerShell is locale-safe; reg query token parsing is not)
for /f "delims=" %%A in ('powershell -NonInteractive -Command "(Get-ItemProperty HKLM:\Software\TaskMesh -ErrorAction SilentlyContinue).AppDir"') do set "APP_DIR=%%A"
for /f "delims=" %%B in ('powershell -NonInteractive -Command "(Get-ItemProperty HKLM:\Software\TaskMesh -ErrorAction SilentlyContinue).Port"') do set "PORT=%%B"
for /f "delims=" %%C in ('powershell -NonInteractive -Command "(Get-ItemProperty HKLM:\Software\TaskMesh -ErrorAction SilentlyContinue).AppUrl"') do set "APP_URL=%%C"

if not defined APP_DIR (
    echo [TaskMesh] Cannot find installation directory. Please reinstall TaskMesh.
    pause
    exit /b 1
)
if not defined PORT set "PORT=4000"

set "NSSM=%APP_DIR%\nssm\nssm.exe"

:: If the server is already running it already owns its port — skip straight to browser
"%NSSM%" status TaskMesh-Server 2>nul | findstr /i "SERVICE_RUNNING" >nul 2>&1
if not errorlevel 1 goto START_AI

:: Server is not running. Check the configured port and reassign if taken.
powershell -NonInteractive -ExecutionPolicy Bypass -File "%APP_DIR%\scripts\ensure-port.ps1"

:: Re-read port and URL from registry (ensure-port.ps1 may have updated them)
for /f "delims=" %%B in ('powershell -NonInteractive -Command "(Get-ItemProperty HKLM:\Software\TaskMesh -ErrorAction SilentlyContinue).Port"') do set "PORT=%%B"
for /f "delims=" %%C in ('powershell -NonInteractive -Command "(Get-ItemProperty HKLM:\Software\TaskMesh -ErrorAction SilentlyContinue).AppUrl"') do set "APP_URL=%%C"

echo [TaskMesh] Starting server on port %PORT%...
"%NSSM%" start TaskMesh-Server

:START_AI
:: Start AI service if installed and not already running
"%NSSM%" status TaskMesh-AI >nul 2>&1
if not errorlevel 1 (
    "%NSSM%" status TaskMesh-AI | findstr /i "SERVICE_RUNNING" >nul 2>&1
    if errorlevel 1 "%NSSM%" start TaskMesh-AI
)

:: Poll until the server accepts TCP connections (up to 30 seconds)
echo [TaskMesh] Waiting for server to be ready...
set "RETRIES=0"

:WAIT_LOOP
powershell -Command "try { $t=[Net.Sockets.TcpClient]::new(); $t.Connect('127.0.0.1',%PORT%); $t.Close(); exit 0 } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 goto READY

set /a RETRIES+=1
if %RETRIES% GEQ 30 (
    echo [TaskMesh] Server is taking longer than expected. Opening browser anyway...
    goto OPEN
)
timeout /t 1 /nobreak >nul
goto WAIT_LOOP

:READY
timeout /t 1 /nobreak >nul

:OPEN
:: Prefer AppUrl from registry (set by install-services.ps1 with the correct port).
:: Fall back to constructing it from Port if AppUrl is missing (older installs).
if defined APP_URL (
    set "URL=%APP_URL%"
) else (
    if "%PORT%"=="80" (set "URL=http://taskmesh.localhost") else (set "URL=http://taskmesh.localhost:%PORT%")
)
start "" "%URL%"
