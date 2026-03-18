# ─────────────────────────────────────────────────────────────────────────────
# TaskMesh Windows Installer Build Pipeline
# Produces: application/installer/windows/Output/TaskMesh-Setup.exe
#
# Prerequisites (must be installed on the build machine):
#   - Node.js v20+ in PATH
#   - Python 3.11+ in PATH (for AI component)
#   - Inno Setup 6 (default install path or set $IsccPath below)
#   - Internet access (downloads Node, NSSM, ffmpeg)
# ─────────────────────────────────────────────────────────────────────────────

param(
    [string]$NodeVersion  = "20.18.1",
    [string]$NssmVersion  = "2.24",
    [string]$IsccPath     = "C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
    [switch]$SkipAI,
    [switch]$SkipDownloads
)

$ErrorActionPreference = "Stop"
if ($IsccPath -eq "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" -and -not (Test-Path $IsccPath)) {
    $userIscc = "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe"
    if (Test-Path $userIscc) { $IsccPath = $userIscc }
}
$Root      = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent  # application/
$Installer = $PSScriptRoot                                          # application/installer/windows/
$Dist      = Join-Path $Installer "dist"

# ── Single source of truth: application/VERSION ───────────────────────────────
$VersionFile = Join-Path $Root "VERSION"
if (-not (Test-Path $VersionFile)) {
    throw "VERSION file not found at: $VersionFile"
}
$AppVersion = (Get-Content $VersionFile -Raw).Trim()
if ($AppVersion -notmatch '^\d+\.\d+\.\d+') {
    throw "Invalid version in VERSION file: '$AppVersion'. Expected X.Y.Z format."
}
Write-Host "Building TaskMesh v$AppVersion" -ForegroundColor Cyan

function Step([string]$msg) {
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host "  $msg" -ForegroundColor Cyan
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
}

function Require([string]$cmd) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        throw "Required command not found: $cmd. Please install it and ensure it is in PATH."
    }
}

# ── Validate prerequisites ────────────────────────────────────────────────────
Step "Validating prerequisites"
Require "node"
Require "npm"
# Python is optional — AI component is skipped automatically if Python is missing.
if (-not $SkipAI) {
    if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
        Write-Warning "Python not found — AI component will be skipped. Use -SkipAI to suppress this warning."
        $SkipAI = $true
    }
}
if (-not (Test-Path $IsccPath)) {
    throw "Inno Setup compiler not found at: $IsccPath`nInstall Inno Setup 6 from https://jrsoftware.org/isdl.php"
}
Write-Host "All prerequisites found." -ForegroundColor Green

# ── 1. Build client ───────────────────────────────────────────────────────────
Step "Building client (React + Vite)"
$ClientDir = Join-Path $Root "client"
# Clear VITE_API_URL so the compiled bundle uses window.location.origin as its
# API base URL instead of a hardcoded port.  Without this, any VITE_API_URL
# inherited from the shell environment (e.g. http://localhost:4000 from a dev
# .env) would be baked into the installer's JS and the client would silently
# talk to whatever is running on that port — including a Docker container —
# rather than the installer's own Express server.
$env:VITE_API_URL = ''
Push-Location $ClientDir
    npm ci 2>&1
    if ($LASTEXITCODE -ne 0) { Pop-Location; throw "npm ci failed for client." }
    npm run build 2>&1
    if ($LASTEXITCODE -ne 0) { Pop-Location; throw "npm run build failed for client (Vite error)." }
Pop-Location
Remove-Item Env:VITE_API_URL -ErrorAction SilentlyContinue   # restore env for rest of build

# Client files go into server/public/ so Express finds them at ../public from server/dist/
$ClientDist = Join-Path $Dist "server\public"
New-Item -ItemType Directory -Force -Path $ClientDist | Out-Null
Copy-Item -Recurse -Force (Join-Path $ClientDir "dist\*") $ClientDist
Write-Host "Client build copied to: $ClientDist" -ForegroundColor Green

# ── 2. Build server ───────────────────────────────────────────────────────────
Step "Building server (TypeScript)"
$ServerDir = Join-Path $Root "server"
Push-Location $ServerDir
    npm ci 2>&1
    if ($LASTEXITCODE -ne 0) { Pop-Location; throw "npm ci failed for server." }
    # Regenerate Prisma client so TypeScript sees current schema types before compiling.
    npx prisma generate 2>&1 | Out-Null
    npm run build 2>&1
    if ($LASTEXITCODE -ne 0) { Pop-Location; throw "npm run build failed for server (TypeScript error)." }
    # Prune to production deps only
    npm prune --production 2>&1
Pop-Location

$ServerDist = Join-Path $Dist "server"
New-Item -ItemType Directory -Force -Path (Join-Path $ServerDist "dist")          | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $ServerDist "node_modules")  | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $ServerDist "prisma")        | Out-Null

Copy-Item -Recurse -Force (Join-Path $ServerDir "dist\*")          (Join-Path $ServerDist "dist")
Copy-Item -Recurse -Force (Join-Path $ServerDir "node_modules\*")  (Join-Path $ServerDist "node_modules")
Copy-Item -Recurse -Force (Join-Path $ServerDir "prisma\*")        (Join-Path $ServerDist "prisma")
Copy-Item -Force           (Join-Path $ServerDir "package.json")   (Join-Path $ServerDist "package.json")
Write-Host "Server build copied to: $ServerDist" -ForegroundColor Green

# Inject version from VERSION file into the dist copy of package.json.
# The source file is left unchanged; this only affects the bundled copy.
$distPkgJson = Join-Path $ServerDist "package.json"
$distPkg = Get-Content $distPkgJson -Raw
$distPkg = $distPkg -replace '"version"\s*:\s*"[^"]*"', "`"version`": `"$AppVersion`""
Set-Content $distPkgJson $distPkg
Write-Host "Injected v$AppVersion into dist server/package.json" -ForegroundColor Green

# Patch the dist copy of schema.prisma for SQLite compatibility.
# The source file always stays as postgresql (used by Docker).
# Changes applied to the dist copy only:
#   1. provider = "sqlite"
#   2. Remove enum definitions (SQLite Prisma doesn't support them)
#   3. Replace enum field types with String
#   4. Replace Json / Json? with String / String? (SQLite Prisma doesn't support Json)
$schemaDist = Join-Path $ServerDist "prisma\schema.prisma"
$schemaContent = Get-Content $schemaDist -Raw

# 1. Switch provider
$schemaContent = $schemaContent -replace '(?m)^(\s*provider\s*=\s*)"postgresql"', '$1"sqlite"'

# 2. Remove enum blocks entirely
$schemaContent = $schemaContent -replace '(?ms)\nenum\s+\w+\s*\{[^}]*\}', ''

# 3. Replace enum type references in model fields, preserving other attributes
#    ColumnType → String
$schemaContent = $schemaContent -replace '\bColumnType\b', 'String'
#    ApiKeyStatus @default(ACTIVE) → String @default("ACTIVE")
$schemaContent = $schemaContent -replace 'ApiKeyStatus(\s+@default\()ACTIVE(\))', 'String$1"ACTIVE"$2'
$schemaContent = $schemaContent -replace '\bApiKeyStatus\b', 'String'

# 4. Replace Json types with String (SQLite stores as TEXT; middleware handles parsing)
$schemaContent = $schemaContent -replace '\bJson\?', 'String?'
$schemaContent = $schemaContent -replace '\bJson\b', 'String'

Set-Content $schemaDist $schemaContent
$patchSummary = "postgresql→sqlite, Json→String, enums→String"
Write-Host "Patched dist schema.prisma: $patchSummary (source unchanged)" -ForegroundColor Green

# Re-generate the Prisma client for SQLite using the bundled Node.js.
# This is required so the client type-maps match the patched schema.
$NodeExe    = Join-Path $Dist    "node\node.exe"
$PrismaScript = Join-Path $ServerDist "node_modules\prisma\build\index.js"
if ((Test-Path $NodeExe) -and (Test-Path $PrismaScript)) {
    $env:DATABASE_URL = "file:./prisma/tmp-gen.db"
    Push-Location $ServerDist
    try {
        & $NodeExe $PrismaScript generate --schema $schemaDist 2>&1 | Out-Null
        Write-Host "Re-generated Prisma client for SQLite." -ForegroundColor Green
    } catch {
        Write-Warning "prisma generate failed: $_"
    } finally {
        Pop-Location
        Remove-Item (Join-Path $ServerDist "prisma\tmp-gen.db") -ErrorAction SilentlyContinue
        Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
    }
}

# Inject enum compatibility shim into the generated Prisma client.
# The compiled server JS imports ColumnType and ApiKeyStatus from @prisma/client.
# After regeneration for SQLite those enums no longer exist in the schema, so we
# re-export them as plain objects to keep runtime code working unchanged.
$enumShim = @'

// ── SQLite build shim: enum objects removed from schema but still used at runtime ──
const _CT = { TEXT:'TEXT', DROPDOWN:'DROPDOWN', MULTI_SELECT:'MULTI_SELECT', DATE:'DATE',
              CHECKBOX:'CHECKBOX', NUMBER:'NUMBER', SOURCE:'SOURCE', ADO_PUSH:'ADO_PUSH',
              ITEM_NO:'ITEM_NO', SNOW_PUSH:'SNOW_PUSH', EMAIL:'EMAIL', DOCUMENTATION:'DOCUMENTATION' };
const _AKS = { ACTIVE:'ACTIVE', EXPIRED:'EXPIRED', REVOKED:'REVOKED' };
exports.ColumnType    = _CT;   module.exports.ColumnType    = _CT;
exports.ApiKeyStatus  = _AKS;  module.exports.ApiKeyStatus  = _AKS;
'@

foreach ($clientIndex in @(
    (Join-Path $ServerDist "node_modules\.prisma\client\index.js"),
    (Join-Path $ServerDist "node_modules\@prisma\client\index.js")
)) {
    if (Test-Path $clientIndex) {
        Add-Content $clientIndex $enumShim
        Write-Host "  Enum shim injected: $clientIndex" -ForegroundColor DarkGray
    }
}

# Patch dist/lib/prisma.js to add a $use middleware that automatically
# JSON.stringify on write and JSON.parse on read for fields that were Json
# in the PostgreSQL schema but are String in the SQLite schema.
$prismaLibJs = Join-Path $ServerDist "dist\lib\prisma.js"
if (Test-Path $prismaLibJs) {
    Set-Content $prismaLibJs @'
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
const client_1 = require("@prisma/client");
// Auto-serialize / deserialize fields that were Json in PostgreSQL schema
// but are stored as TEXT (String) in the SQLite schema.
const _JSON_FIELDS = {
    ConnectorConfig:         ['config'],
    AIExtraction:            ['extractedTasks'],
    DocumentationSettings:   ['templates', 'customVariables'],
    ArchivedTask:            ['snapshot'],
    BoardSort:               ['sorts'],
    CustomTheme:             ['colors'],
    ApiKey:                  ['scopes'],
};
function _fixWrite(model, args) {
    const fields = _JSON_FIELDS[model] || [];
    function fix(d) {
        if (!d || typeof d !== 'object') return;
        for (const f of fields)
            if (d[f] !== undefined && d[f] !== null && typeof d[f] !== 'string')
                d[f] = JSON.stringify(d[f]);
    }
    if (args.data)   fix(args.data);
    if (args.create) fix(args.create);
    if (args.update) fix(args.update);
}
function _fixRead(model, result) {
    const fields = _JSON_FIELDS[model] || [];
    if (!fields.length) return result;
    function fix(obj) {
        if (!obj || typeof obj !== 'object') return obj;
        for (const f of fields)
            if (typeof obj[f] === 'string') try { obj[f] = JSON.parse(obj[f]); } catch {}
        return obj;
    }
    if (Array.isArray(result)) return result.map(fix);
    return fix(result);
}
exports.prisma = new client_1.PrismaClient().$extends({
    query: {
        $allModels: {
            async $allOperations({ model, operation, args, query }) {
                _fixWrite(model, args);
                const result = await query(args);
                return _fixRead(model, result);
            },
        },
    },
});
//# sourceMappingURL=prisma.js.map
'@
    Write-Host "Patched dist/lib/prisma.js with JSON serialization middleware." -ForegroundColor Green
}

# ── 3. Download Node.js ───────────────────────────────────────────────────────
$NodeDir = Join-Path $Dist "node"
if ($SkipDownloads -and (Test-Path $NodeDir)) {
    Write-Host "Skipping Node.js download (already present)." -ForegroundColor Yellow
} else {
    Step "Downloading Node.js v$NodeVersion (Windows x64)"
    $NodeZip = Join-Path $Installer "node-v$NodeVersion-win-x64.zip"
    $NodeUrl  = "https://nodejs.org/dist/v$NodeVersion/node-v$NodeVersion-win-x64.zip"

    if (-not (Test-Path $NodeZip)) {
        Invoke-WebRequest -Uri $NodeUrl -OutFile $NodeZip -UseBasicParsing
    }

    if (Test-Path $NodeDir) { Remove-Item -Recurse -Force $NodeDir }
    Expand-Archive -Path $NodeZip -DestinationPath $Dist
    # Rename extracted dir (node-v20.x.x-win-x64 → node)
    $ExtractedNode = Get-Item (Join-Path $Dist "node-v$NodeVersion-win-x64")
    Rename-Item $ExtractedNode.FullName "node"
    Write-Host "Node.js extracted to: $NodeDir" -ForegroundColor Green
}

# ── 4. Download NSSM ──────────────────────────────────────────────────────────
$NssmExe = Join-Path $Dist "nssm\nssm.exe"
if ($SkipDownloads -and (Test-Path $NssmExe)) {
    Write-Host "Skipping NSSM download (already present)." -ForegroundColor Yellow
} else {
    $NssmDir = Join-Path $Dist "nssm"
    New-Item -ItemType Directory -Force -Path $NssmDir | Out-Null

    # Try winget-installed nssm first (avoids nssm.cc download which is often unavailable)
    $NssmCmd = Get-Command nssm -ErrorAction SilentlyContinue
    if ($NssmCmd) {
        Step "Copying NSSM from local install (winget)"
        Copy-Item $NssmCmd.Source (Join-Path $NssmDir "nssm.exe")
    } else {
        Step "Downloading NSSM $NssmVersion"
        $NssmZip = Join-Path $Installer "nssm-$NssmVersion.zip"
        $NssmUrl  = "https://nssm.cc/release/nssm-$NssmVersion.zip"

        if (-not (Test-Path $NssmZip)) {
            Invoke-WebRequest -Uri $NssmUrl -OutFile $NssmZip -UseBasicParsing
        }

        $NssmStage = Join-Path $Installer "nssm-stage"
        if (Test-Path $NssmStage) { Remove-Item -Recurse -Force $NssmStage }
        Expand-Archive -Path $NssmZip -DestinationPath $NssmStage

        # Prefer 64-bit binary
        $NssmBin = Join-Path $NssmStage "nssm-$NssmVersion\win64\nssm.exe"
        if (-not (Test-Path $NssmBin)) {
            $NssmBin = Join-Path $NssmStage "nssm-$NssmVersion\win32\nssm.exe"
        }
        Copy-Item $NssmBin (Join-Path $NssmDir "nssm.exe")
        Remove-Item -Recurse -Force $NssmStage
    }
    Write-Host "NSSM copied to: $NssmDir" -ForegroundColor Green
}

# ── 5. AI component ───────────────────────────────────────────────────────────
if ($SkipAI) {
    Write-Host "Skipping AI component build (-SkipAI flag set)." -ForegroundColor Yellow
} else {
    Step "Building AI service with PyInstaller"
    $AiSrc = Join-Path $Root "ai-service\app.py"
    if (-not (Test-Path $AiSrc)) {
        Write-Warning "AI service source not found at $AiSrc — skipping."
    } else {
        # Wrap in try/catch so a PyInstaller failure warns but never aborts the
        # core installer build — AI is an optional component.
        try {
            python -m pip install pyinstaller
            if ($LASTEXITCODE -ne 0) { throw "pip install pyinstaller failed." }

            $SpecFile        = Join-Path $Root "ai-service\ai-service.spec"
            $PyInstallerOut  = Join-Path $Installer "pyinstaller-dist"
            $PyInstallerWork = Join-Path $Installer "pyinstaller-build"

            if (-not (Test-Path $SpecFile)) {
                throw "PyInstaller spec file not found: $SpecFile"
            }

            Push-Location (Join-Path $Root "ai-service")
                python -m PyInstaller $SpecFile `
                    --distpath $PyInstallerOut `
                    --workpath $PyInstallerWork `
                    --noconfirm
            Pop-Location
            if ($LASTEXITCODE -ne 0) { throw "PyInstaller exited with code $LASTEXITCODE." }

            $AiDist = Join-Path $Dist "ai-service"
            if (Test-Path $AiDist) { Remove-Item -Recurse -Force $AiDist }
            Copy-Item -Recurse -Force (Join-Path $PyInstallerOut "ai-service") $AiDist
            Write-Host "AI service bundled to: $AiDist" -ForegroundColor Green
        } catch {
            Write-Warning "AI component build failed (will be excluded from installer): $_"
            Write-Warning "To include AI features, fix the error above and rebuild."
        }
    }

    # ffmpeg
    $FfmpegDir = Join-Path $Dist "ffmpeg"
    if ($SkipDownloads -and (Test-Path (Join-Path $FfmpegDir "ffmpeg.exe"))) {
        Write-Host "Skipping ffmpeg download (already present)." -ForegroundColor Yellow
    } else {
        Step "Downloading ffmpeg (Windows static)"
        # Using the gyan.dev static build
        $FfmpegZip = Join-Path $Installer "ffmpeg-release-essentials.zip"
        $FfmpegUrl = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"
        if (-not (Test-Path $FfmpegZip)) {
            Invoke-WebRequest -Uri $FfmpegUrl -OutFile $FfmpegZip -UseBasicParsing
        }
        $FfmpegStage = Join-Path $Installer "ffmpeg-stage"
        if (Test-Path $FfmpegStage) { Remove-Item -Recurse -Force $FfmpegStage }
        Expand-Archive -Path $FfmpegZip -DestinationPath $FfmpegStage
        New-Item -ItemType Directory -Force -Path $FfmpegDir | Out-Null
        $FfmpegBin = Get-ChildItem -Recurse -Filter "ffmpeg.exe" $FfmpegStage | Select-Object -First 1
        Copy-Item $FfmpegBin.FullName (Join-Path $FfmpegDir "ffmpeg.exe")
        Remove-Item -Recurse -Force $FfmpegStage
        Write-Host "ffmpeg copied to: $FfmpegDir" -ForegroundColor Green
    }
}

# ── 6. Create placeholder assets if missing ───────────────────────────────────
Step "Checking installer assets"
$AssetsDir = Join-Path $Installer "assets"
$SharedDir = Join-Path (Split-Path $Installer -Parent) "shared"
New-Item -ItemType Directory -Force -Path $AssetsDir | Out-Null
New-Item -ItemType Directory -Force -Path $SharedDir  | Out-Null

if (-not (Test-Path (Join-Path $SharedDir "LICENSE.txt"))) {
    Set-Content (Join-Path $SharedDir "LICENSE.txt") "TaskMesh - All rights reserved.`nSee https://taskmesh.co for license terms."
    Write-Host "Created placeholder shared\LICENSE.txt" -ForegroundColor Yellow
}
# manifest.schema.json and example-connector live in server/src/connectors/ —
# referenced directly from taskmesh-setup.iss; no placeholder needed here.

# Generate placeholder brand assets using the website's indigo color scheme.
# Skips generation only if the file already exceeds 1 KB (i.e., a designer asset
# has been dropped in). Delete the files from installer/windows/assets/ to force-regenerate.
# welcome.bmp  — 164×314  WizardImageFile: left sidebar on Welcome/Finish pages
# banner.bmp   — 55×55    WizardSmallImageFile: top-right corner on inner pages
# taskmesh.ico — 256×256  setup EXE / taskbar / shortcut icon
Add-Type -AssemblyName System.Drawing

# BMPs are always regenerated (they're cheap, the layout and colours have changed
# multiple times). The ICO is preserved if a designer has dropped in a real one (> 1 KB).
# To use custom BMP assets: replace the generated files AFTER running build.ps1.
foreach ($staleAsset in @('welcome.bmp', 'banner.bmp', 'taskmesh.ico')) {
    $stalePath = Join-Path $AssetsDir $staleAsset
    if (Test-Path $stalePath) { Remove-Item -Force $stalePath }
}

function Test-DesignerAsset([string]$Path) {
    # A real hand-crafted multi-size ICO is typically 20KB+.
    # Generated ICOs are deleted before this check (see staleAsset loop above)
    # so this guard only preserves a deliberately placed designer asset.
    return (Test-Path $Path) -and ((Get-Item $Path).Length -gt 20480)
}

# Brand colors matching the website (#6366F1 indigo family)
$colorTop    = [System.Drawing.Color]::FromArgb(0x4F, 0x46, 0xE5)  # #4F46E5
$colorBottom = [System.Drawing.Color]::FromArgb(0x81, 0x8C, 0xF8)  # #818CF8
$colorWhite  = [System.Drawing.Color]::White
$colorSoft   = [System.Drawing.Color]::FromArgb(0xC7, 0xD2, 0xFE)  # #C7D2FE

# ── welcome.bmp (164×314) — WizardImageFile: left sidebar on Welcome/Finish ──
$welcomePath = Join-Path $AssetsDir "welcome.bmp"
if ($true) {
    $bmp = [System.Drawing.Bitmap]::new(164, 314)
    $bmp.SetResolution(96, 96)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $grad = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
        [System.Drawing.Rectangle]::new(0, 0, 164, 314),
        $colorTop, $colorBottom,
        [System.Drawing.Drawing2D.LinearGradientMode]::Vertical)
    $g.FillRectangle($grad, 0, 0, 164, 314)
    $grad.Dispose()
    $hFont  = [System.Drawing.Font]::new('Segoe UI', 18, [System.Drawing.FontStyle]::Bold,    [System.Drawing.GraphicsUnit]::Pixel)
    $hBrush = [System.Drawing.SolidBrush]::new($colorWhite)
    $tFont  = [System.Drawing.Font]::new('Segoe UI', 12, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
    $tBrush = [System.Drawing.SolidBrush]::new($colorSoft)
    $g.DrawString('TaskMesh', $hFont, $hBrush, 10, 24)
    $g.DrawString('All Your Work. One Place.', $tFont, $tBrush, 10, 282)
    $bmp.Save($welcomePath, [System.Drawing.Imaging.ImageFormat]::Bmp)
    $g.Dispose(); $bmp.Dispose()
    $hFont.Dispose(); $hBrush.Dispose(); $tFont.Dispose(); $tBrush.Dispose()
    Write-Host "Generated placeholder welcome.bmp" -ForegroundColor Yellow
}

# ── banner.bmp (55×55) — WizardSmallImageFile: top-right corner of inner pages ─
# A small mesh-grid logo (same motif as the ICO) on white background.
$bannerPath = Join-Path $AssetsDir "banner.bmp"
if ($true) {
    $bsz = 55
    $bmp = [System.Drawing.Bitmap]::new($bsz, $bsz)
    $bmp.SetResolution(96, 96)
    $g   = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode      = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.CompositingMode    = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    # White background
    $g.FillRectangle([System.Drawing.SolidBrush]::new($colorWhite), 0, 0, $bsz, $bsz)
    # 3×3 mesh grid scaled to fit a 55×55 canvas (9px margin, 18px spacing, 3px dot radius)
    [int[]]$bx = @(9, 27, 45)
    [int[]]$by = @(9, 27, 45)
    $bDotR  = [float]2.5; $bLineW = [float]1.0
    $bhPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(0x99, 0x81, 0x8C, 0xF8), $bLineW)
    $bvPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(0x66, 0x81, 0x8C, 0xF8), $bLineW)
    $bdPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(0x4D, 0x81, 0x8C, 0xF8), $bLineW)
    for ($r = 0; $r -lt 3; $r++) { for ($c = 0; $c -lt 2; $c++) { $g.DrawLine($bhPen, $bx[$c], $by[$r], $bx[$c+1], $by[$r]) } }
    for ($r = 0; $r -lt 2; $r++) { for ($c = 0; $c -lt 3; $c++) { $g.DrawLine($bvPen, $bx[$c], $by[$r], $bx[$c], $by[$r+1]) } }
    for ($r = 0; $r -lt 2; $r++) { for ($c = 0; $c -lt 2; $c++) {
        $g.DrawLine($bdPen, $bx[$c], $by[$r], $bx[$c+1], $by[$r+1])
        $g.DrawLine($bdPen, $bx[$c+1], $by[$r], $bx[$c], $by[$r+1])
    } }
    $bhPen.Dispose(); $bvPen.Dispose(); $bdPen.Dispose()
    $bDotRgb = @(
        @(0x63,0x66,0xF1), @(0x63,0x66,0xF1), @(0x63,0x66,0xF1),
        @(0x81,0x8C,0xF8), @(0x81,0x8C,0xF8), @(0x81,0x8C,0xF8),
        @(0xA5,0xB4,0xFC), @(0xA5,0xB4,0xFC), @(0xA5,0xB4,0xFC)
    )
    for ($r = 0; $r -lt 3; $r++) { for ($c = 0; $c -lt 3; $c++) {
        $rgb = $bDotRgb[$r * 3 + $c]
        $br  = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb($rgb[0], $rgb[1], $rgb[2]))
        $g.FillEllipse($br, [float]($bx[$c] - $bDotR), [float]($by[$r] - $bDotR), [float]($bDotR * 2), [float]($bDotR * 2))
        $br.Dispose()
    } }
    $g.Dispose()
    $bmp.Save($bannerPath, [System.Drawing.Imaging.ImageFormat]::Bmp)
    $bmp.Dispose()
    Write-Host "Generated placeholder banner.bmp (55x55 small logo)" -ForegroundColor Yellow
}

# ── taskmesh.ico (16×16 + 32×32 + 256×256, PNG-in-ICO) ──────────────────────
# Geometry matches icon.svg exactly: viewBox 0 0 100 100, g translate(5,5).
# Transparent background so the icon composites correctly on any surface.
$icoPath = Join-Path $AssetsDir "taskmesh.ico"
if (-not (Test-DesignerAsset $icoPath)) {

    # Renders the icon.svg mesh-grid at an arbitrary square pixel size.
    # All coordinates are derived from the SVG viewBox (100×100) scaled by $sz/100.
    # After g translate(5,5): dot centers at (25,55,85), lines in gaps (30→50, 60→80).
    function Render-MeshIcon {
        param([int]$sz)
        $s = [float]($sz / 100.0)

        # Dot centers (SVG cx/cy + translate(5,5)) scaled to pixels
        [int[]]$xs = @([int](25*$s), [int](55*$s), [int](85*$s))
        [int[]]$ys = @([int](25*$s), [int](55*$s), [int](85*$s))
        $dotR  = [float]([Math]::Max(1.5, 5.0 * $s))

        # Per-row brand colors: brand-500 / brand-400 / brand-300
        $rowC = @(
            [System.Drawing.Color]::FromArgb(0x63, 0x66, 0xF1),
            [System.Drawing.Color]::FromArgb(0x81, 0x8C, 0xF8),
            [System.Drawing.Color]::FromArgb(0xA5, 0xB4, 0xFC)
        )
        $lineW = [float]([Math]::Max(1.0, 2.0 * $s))    # H/V stroke-width=2 in SVG
        $diagW = [float]([Math]::Max(1.0, 1.5 * $s))    # diagonal stroke-width=1.5

        $bmp = [System.Drawing.Bitmap]::new($sz, $sz, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $bmp.SetResolution(96, 96)
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.SmoothingMode      = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $g.CompositingMode    = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
        $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $g.Clear([System.Drawing.Color]::Transparent)   # transparent background

        # Draw order: diagonals (lowest) → V lines → H lines → dots (topmost)

        # Diagonal lines — opacity 0.3 → alpha 77
        # SVG (inside g): (25,25)→(45,45), (55,25)→(75,45), (25,55)→(45,75)
        # After translate(5,5) in SVG space: (30,30)→(50,50), (60,30)→(80,50), (30,60)→(50,80)
        $diagDefs = @(
            @{ x1=30; y1=30; x2=50; y2=50; row=0 },
            @{ x1=60; y1=30; x2=80; y2=50; row=0 },
            @{ x1=30; y1=60; x2=50; y2=80; row=1 }
        )
        foreach ($d in $diagDefs) {
            $c   = $rowC[$d.row]
            $pen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(77, $c.R, $c.G, $c.B), $diagW)
            $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
            $pen.EndCap   = [System.Drawing.Drawing2D.LineCap]::Round
            $g.DrawLine($pen, [int]($d.x1*$s), [int]($d.y1*$s), [int]($d.x2*$s), [int]($d.y2*$s))
            $pen.Dispose()
        }

        # Vertical lines — opacity 0.4 → alpha 102
        # Two y-gaps: rows 0-1 (30→50 in SVG space, color=brand-500),
        #             rows 1-2 (60→80 in SVG space, color=brand-400)
        $vGaps = @( @{ y1=30; y2=50; row=0 }, @{ y1=60; y2=80; row=1 } )
        foreach ($vd in $vGaps) {
            $c   = $rowC[$vd.row]
            $pen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(102, $c.R, $c.G, $c.B), $lineW)
            $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
            $pen.EndCap   = [System.Drawing.Drawing2D.LineCap]::Round
            $y1px = [int]($vd.y1 * $s); $y2px = [int]($vd.y2 * $s)
            foreach ($xpx in $xs) { $g.DrawLine($pen, $xpx, $y1px, $xpx, $y2px) }
            $pen.Dispose()
        }

        # Horizontal lines — opacity 0.6 → alpha 153, per-row color
        # Two x-gaps per row: 30→50 and 60→80 in SVG space
        $hGaps = @( @{ x1=30; x2=50 }, @{ x1=60; x2=80 } )
        for ($r = 0; $r -lt 3; $r++) {
            $c   = $rowC[$r]
            $pen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(153, $c.R, $c.G, $c.B), $lineW)
            $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
            $pen.EndCap   = [System.Drawing.Drawing2D.LineCap]::Round
            $ypx = $ys[$r]
            foreach ($hd in $hGaps) { $g.DrawLine($pen, [int]($hd.x1*$s), $ypx, [int]($hd.x2*$s), $ypx) }
            $pen.Dispose()
        }

        # Dots — solid fill, per-row color
        for ($r = 0; $r -lt 3; $r++) {
            $brush = [System.Drawing.SolidBrush]::new($rowC[$r])
            for ($c = 0; $c -lt 3; $c++) {
                $g.FillEllipse($brush,
                    [float]($xs[$c] - $dotR), [float]($ys[$r] - $dotR),
                    [float]($dotR * 2),        [float]($dotR * 2))
            }
            $brush.Dispose()
        }

        $g.Dispose()
        return $bmp
    }

    $b16  = Render-MeshIcon -sz 16
    $b32  = Render-MeshIcon -sz 32
    $b256 = Render-MeshIcon -sz 256

    $ms16  = [System.IO.MemoryStream]::new(); $b16.Save($ms16,   [System.Drawing.Imaging.ImageFormat]::Png); $b16.Dispose()
    $ms32  = [System.IO.MemoryStream]::new(); $b32.Save($ms32,   [System.Drawing.Imaging.ImageFormat]::Png); $b32.Dispose()
    $ms256 = [System.IO.MemoryStream]::new(); $b256.Save($ms256, [System.Drawing.Imaging.ImageFormat]::Png); $b256.Dispose()
    $png16  = $ms16.ToArray();  $ms16.Dispose()
    $png32  = $ms32.ToArray();  $ms32.Dispose()
    $png256 = $ms256.ToArray(); $ms256.Dispose()

    # Assemble 3-image ICO: ICONDIR (6) + 3×ICONDIRENTRY (3×16=48) = 54 bytes header
    # Offsets: img0 @ 54, img1 @ 54+len(png16), img2 @ 54+len(png16)+len(png32)
    $icoStream = [System.IO.MemoryStream]::new()
    $iw = [System.IO.BinaryWriter]::new($icoStream)
    $iw.Write([uint16]0); $iw.Write([uint16]1); $iw.Write([uint16]3)  # ICONDIR: 3 images
    # Entry 0: 16×16
    $iw.Write([byte]16); $iw.Write([byte]16); $iw.Write([byte]0); $iw.Write([byte]0)
    $iw.Write([uint16]1); $iw.Write([uint16]32)
    $iw.Write([uint32]$png16.Length); $iw.Write([uint32]54)
    # Entry 1: 32×32
    $iw.Write([byte]32); $iw.Write([byte]32); $iw.Write([byte]0); $iw.Write([byte]0)
    $iw.Write([uint16]1); $iw.Write([uint16]32)
    $iw.Write([uint32]$png32.Length); $iw.Write([uint32](54 + $png16.Length))
    # Entry 2: 256×256 (byte 0 = 256 in ICO format)
    $iw.Write([byte]0); $iw.Write([byte]0); $iw.Write([byte]0); $iw.Write([byte]0)
    $iw.Write([uint16]1); $iw.Write([uint16]32)
    $iw.Write([uint32]$png256.Length); $iw.Write([uint32](54 + $png16.Length + $png32.Length))
    $iw.Write($png16); $iw.Write($png32); $iw.Write($png256)
    $iw.Flush()
    [System.IO.File]::WriteAllBytes($icoPath, $icoStream.ToArray())
    $iw.Dispose(); $icoStream.Dispose()
    Write-Host "Generated taskmesh.ico (16+32+256px, transparent bg, SVG geometry)" -ForegroundColor Green
}

# ── 6b. Compile ps-launcher.exe (GUI WinExe — no console window ever created) ─
# Root cause of the flash on Windows 11 + Windows Terminal:
#   1. A WinExe parent with no console spawns powershell.exe with UseShellExecute=false
#      but WITHOUT redirecting stdout/stderr.
#   2. PowerShell inherits null/invalid I/O handles from the WinExe parent.
#   3. PowerShell (or the .NET runtime) calls AllocConsole() to obtain valid handles.
#   4. AllocConsole() creates a new visible console; Windows Terminal intercepts it
#      and briefly shows a window — the flash.
# Fix: redirect stdout/stderr to pipes in the launcher so PowerShell always receives
# valid handles and never needs to call AllocConsole().  Async drain threads prevent
# the pipe buffers from filling and deadlocking.
$LauncherExe = Join-Path $Installer "scripts\ps-launcher.exe"
$LauncherCs = @'
using System;
using System.Diagnostics;
using System.Text;
using System.Threading;

class HiddenLauncher {
    [STAThread]
    static void Main(string[] args) {
        if (args.Length < 1) return;
        // Build: powershell.exe -NonInteractive -NoProfile -ExecutionPolicy Bypass
        //        -WindowStyle Hidden -File "<args[0]>" [args[1..n]]
        // Named params (start with -) are passed as-is; values are quoted.
        var sb = new StringBuilder();
        sb.AppendFormat(
            "-NonInteractive -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"{0}\"",
            args[0]);
        for (int i = 1; i < args.Length; i++) {
            sb.Append(" ");
            if (args[i].StartsWith("-")) {
                sb.Append(args[i]);
            } else {
                sb.AppendFormat("\"{0}\"", args[i].Replace("\"", "\\\""));
            }
        }
        var psi = new ProcessStartInfo("powershell.exe", sb.ToString()) {
            CreateNoWindow         = true,
            UseShellExecute        = false,
            RedirectStandardOutput = true,   // give PowerShell a valid stdout handle
            RedirectStandardError  = true,   // give PowerShell a valid stderr handle
            WindowStyle            = ProcessWindowStyle.Hidden
        };
        var p = Process.Start(psi);
        if (p == null) return;
        // Drain pipes on background threads — prevents buffer deadlock when the
        // script produces output and ensures the child never blocks on I/O.
        var outDone = new ManualResetEventSlim(false);
        var errDone = new ManualResetEventSlim(false);
        p.OutputDataReceived += (s, e) => { if (e.Data == null) outDone.Set(); };
        p.ErrorDataReceived  += (s, e) => { if (e.Data == null) errDone.Set(); };
        p.BeginOutputReadLine();
        p.BeginErrorReadLine();
        p.WaitForExit();
        outDone.Wait(5000);
        errDone.Wait(5000);
    }
}
'@

if (Test-Path $LauncherExe) { Remove-Item -Force $LauncherExe }
Add-Type -TypeDefinition $LauncherCs -OutputAssembly $LauncherExe -OutputType WindowsApplication
Write-Host "Compiled ps-launcher.exe (hidden PowerShell launcher, WinExe)" -ForegroundColor Green

# ── 7. Compile installer ─────────────────────────────────────────────────────
Step "Compiling Inno Setup installer"

# Build copy lives in the same directory as the source so all relative paths
# inside the .iss resolve correctly for ISCC. Never modify the source file.
$IssSource = Join-Path $Installer "taskmesh-setup.iss"
$IssBuild  = Join-Path $Installer "taskmesh-setup.build.iss"
Copy-Item -Force $IssSource $IssBuild

# Inject version from VERSION file into the build copy of the ISS script.
# The source taskmesh-setup.iss is never modified.
$issContent = Get-Content $IssBuild -Raw
$issContent = $issContent -replace '(?m)^(#define AppVersion\s+)"[^"]*"', "`$1`"$AppVersion`""
Set-Content $IssBuild $issContent
Write-Host "Injected v$AppVersion into ISS build copy" -ForegroundColor Green

$OutputDir = Join-Path $Installer "Output"
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$SetupExeOld = Join-Path $OutputDir "TaskMesh-Setup.exe"
$IsccOutputDir = $OutputDir   # default: output straight to Output\

if (Test-Path $SetupExeOld) {
    try {
        Remove-Item -Force $SetupExeOld -ErrorAction Stop
        Write-Host "Removed previous TaskMesh-Setup.exe" -ForegroundColor Yellow
    } catch {
        # AV is holding the file. Route ISCC to a temp subdirectory so the
        # build still succeeds, then swap the files once ISCC is done.
        Write-Warning "Previous TaskMesh-Setup.exe is locked — writing to temp dir."
        $IsccOutputDir = Join-Path $OutputDir "tmp-build"
        New-Item -ItemType Directory -Force -Path $IsccOutputDir | Out-Null
    }
}

$isccOutput = & $IsccPath $IssBuild "/O$IsccOutputDir" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Inno Setup output:" -ForegroundColor Red
    $isccOutput | Write-Host
    throw "Inno Setup compilation failed (exit code $LASTEXITCODE)."
}

# If ISCC wrote to a temp dir, move the result to the normal location.
$TempExe = Join-Path $IsccOutputDir "TaskMesh-Setup.exe"
if ($IsccOutputDir -ne $OutputDir -and (Test-Path $TempExe)) {
    # Try to replace the locked file; if that still fails, leave both and
    # tell the user where the new build is.
    try {
        Move-Item -Force $TempExe $SetupExeOld -ErrorAction Stop
        Remove-Item $IsccOutputDir -Recurse -Force -ErrorAction SilentlyContinue
    } catch {
        Write-Warning "Could not replace locked EXE. New build is at: $TempExe"
        $SetupExeOld = $TempExe   # point summary at the working file
    }
}

$SetupExe = if (Test-Path $SetupExeOld) { $SetupExeOld } else { $TempExe }
if (-not (Test-Path $SetupExe)) {
    throw "Expected output not found: $SetupExe"
}
$size = [math]::Round((Get-Item $SetupExe).Length / 1MB, 1)
if ($size -lt 5) {
    throw "Output EXE is only ${size} MB — build is likely incomplete or corrupted."
}
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host "  BUILD COMPLETE" -ForegroundColor Green
Write-Host "  Output : $SetupExe" -ForegroundColor Green
Write-Host "  Size   : ${size} MB" -ForegroundColor Green
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
