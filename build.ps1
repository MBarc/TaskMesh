# ─────────────────────────────────────────────────────────────────────────────
# TaskMesh Unified Build Entry Point
#
# Single source of truth: server/, client/, and ai-service/ are shared by both
# targets. Deployment-specific differences (database provider, port binding,
# service management) are handled here — never by editing the source files.
#
# Usage:
#   .\build.ps1 -Target docker              # build all Docker images locally
#   .\build.ps1 -Target installer           # build the Windows installer EXE
#   .\build.ps1 -Target installer -SkipAI   # installer without the AI component
#
# Source-of-truth rules:
#   • server/prisma/schema.prisma  → always postgresql  (Docker uses it as-is;
#                                    installer/build.ps1 patches the dist copy)
#   • server/src/index.ts          → NODE_ENV check serves static files in prod
#   • .env.example                 → documents vars for both targets
# ─────────────────────────────────────────────────────────────────────────────

param(
    [Parameter(Mandatory)]
    [ValidateSet("docker", "installer")]
    [string]$Target,

    # Installer-only flags (ignored for docker target)
    [switch]$SkipAI,
    [switch]$SkipDownloads,
    [string]$IsccPath = "C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
)

$ErrorActionPreference = "Stop"
$AppDir = $PSScriptRoot   # application/

function Banner([string]$msg) {
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Magenta
    Write-Host "  $msg" -ForegroundColor Magenta
    Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Magenta
}

# ── Docker ────────────────────────────────────────────────────────────────────
if ($Target -eq "docker") {
    Banner "Building Docker images"

    $ComposeFile = Join-Path $AppDir "docker\docker-compose.yml"

    if (-not (Get-Command "docker" -ErrorAction SilentlyContinue)) {
        throw "Docker is not installed or not in PATH."
    }

    # Build all images defined in the compose file
    docker compose -f $ComposeFile build
    if ($LASTEXITCODE -ne 0) { throw "docker compose build failed." }

    Write-Host ""
    Write-Host "Docker images built." -ForegroundColor Green
    Write-Host "Start with: docker compose -f application/docker/docker-compose.yml up" -ForegroundColor Cyan
}

# ── Windows Installer ─────────────────────────────────────────────────────────
if ($Target -eq "installer") {
    Banner "Building Windows installer"

    $InstallerScript = Join-Path $AppDir "installer\build.ps1"

    if (-not (Test-Path $InstallerScript)) {
        throw "Installer build script not found at: $InstallerScript"
    }

    & $InstallerScript `
        -SkipAI:$SkipAI `
        -SkipDownloads:$SkipDownloads `
        -IsccPath $IsccPath

    if ($LASTEXITCODE -ne 0) { throw "Installer build failed." }
}
