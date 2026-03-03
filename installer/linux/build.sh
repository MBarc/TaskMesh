#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# TaskMesh Linux Installer Build Pipeline
# Produces: application/installer/linux/Output/TaskMesh-Installer.tar.gz
#
# Prerequisites (must be installed on the build machine):
#   - Node.js v20+ in PATH
#   - Python 3.11+ in PATH (for AI component)
#   - Qt Installer Framework binarycreator in PATH (or set BINARYCREATOR=...)
#   - Internet access (downloads Node.js, ffmpeg)
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Parameters (override via env vars) ──────────────────────────────────────
NODE_VERSION="${NODE_VERSION:-20.18.1}"
SKIP_AI="${SKIP_AI:-false}"
SKIP_DOWNLOADS="${SKIP_DOWNLOADS:-false}"
BINARYCREATOR="${BINARYCREATOR:-binarycreator}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"   # application/
INSTALLER="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"    # application/installer/linux/
DIST="${INSTALLER}/dist"
OUTPUT_DIR="${INSTALLER}/Output"

step() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  $1"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

require() {
    if ! command -v "$1" &>/dev/null; then
        echo "ERROR: Required command not found: $1" >&2
        echo "       Please install it and ensure it is in PATH." >&2
        exit 1
    fi
}

# ── Validate prerequisites ────────────────────────────────────────────────────
step "Validating prerequisites"
require node
require npm

if [[ "${SKIP_AI}" != "true" ]]; then
    if ! command -v python3 &>/dev/null; then
        echo "WARNING: python3 not found — AI component will be skipped."
        SKIP_AI=true
    fi
fi

if ! "${BINARYCREATOR}" --version &>/dev/null 2>&1; then
    echo "ERROR: Qt Installer Framework binarycreator not found." >&2
    echo "       Install QtIFW from https://download.qt.io/official_releases/qt-installer-framework/" >&2
    echo "       or set BINARYCREATOR=/path/to/binarycreator" >&2
    exit 1
fi

echo "All prerequisites found."

# ── 1. Build client ───────────────────────────────────────────────────────────
step "Building client (React + Vite)"
CLIENT_DIR="${ROOT}/client"
# Clear VITE_API_URL so the compiled bundle uses window.location.origin as its
# API base URL instead of any hardcoded dev port.
export VITE_API_URL=''
(cd "${CLIENT_DIR}" && npm ci && npm run build)
unset VITE_API_URL

CLIENT_DIST="${DIST}/server/public"
mkdir -p "${CLIENT_DIST}"
cp -r "${CLIENT_DIR}/dist/." "${CLIENT_DIST}/"
echo "Client build copied to: ${CLIENT_DIST}"

# ── 2. Build server ───────────────────────────────────────────────────────────
step "Building server (TypeScript)"
SERVER_DIR="${ROOT}/server"
(cd "${SERVER_DIR}" && npm ci && npm run build && npm prune --production)

SERVER_DIST="${DIST}/server"
mkdir -p "${SERVER_DIST}/dist" "${SERVER_DIST}/node_modules" "${SERVER_DIST}/prisma"
cp -r "${SERVER_DIR}/dist/."         "${SERVER_DIST}/dist/"
cp -r "${SERVER_DIR}/node_modules/." "${SERVER_DIST}/node_modules/"
cp -r "${SERVER_DIR}/prisma/."       "${SERVER_DIST}/prisma/"
echo "Server build copied to: ${SERVER_DIST}"

# Patch the dist copy of schema.prisma for SQLite compatibility.
# The source file always stays as postgresql (used by Docker).
SCHEMA_DIST="${SERVER_DIST}/prisma/schema.prisma"

# 1. Switch provider
sed -i 's/provider = "postgresql"/provider = "sqlite"/' "${SCHEMA_DIST}"
# 2. Remove enum blocks entirely (multi-line)
perl -i -0pe 's/\nenum\s+\w+\s*\{[^}]*\}//g' "${SCHEMA_DIST}"
# 3. Replace enum type references
sed -i 's/\bColumnType\b/String/g' "${SCHEMA_DIST}"
sed -i 's/ApiKeyStatus\(\s*@default(\)ACTIVE\()\)/String\1"ACTIVE"\2/g' "${SCHEMA_DIST}"
sed -i 's/\bApiKeyStatus\b/String/g' "${SCHEMA_DIST}"
# 4. Replace Json types with String (SQLite stores as TEXT)
sed -i 's/Json?/String?/g' "${SCHEMA_DIST}"
sed -i 's/\bJson\b/String/g' "${SCHEMA_DIST}"

echo "Patched dist schema.prisma: postgresql→sqlite, Json→String, enums→String (source unchanged)"

# Inject enum compatibility shim into the generated Prisma client.
ENUM_SHIM='
// ── SQLite build shim: enum objects removed from schema but still used at runtime ──
const _CT = { TEXT:"TEXT", DROPDOWN:"DROPDOWN", MULTI_SELECT:"MULTI_SELECT", DATE:"DATE",
              CHECKBOX:"CHECKBOX", NUMBER:"NUMBER", SOURCE:"SOURCE", ADO_PUSH:"ADO_PUSH",
              ITEM_NO:"ITEM_NO", SNOW_PUSH:"SNOW_PUSH", EMAIL:"EMAIL", DOCUMENTATION:"DOCUMENTATION" };
const _AKS = { ACTIVE:"ACTIVE", EXPIRED:"EXPIRED", REVOKED:"REVOKED" };
exports.ColumnType    = _CT;   module.exports.ColumnType    = _CT;
exports.ApiKeyStatus  = _AKS;  module.exports.ApiKeyStatus  = _AKS;
'
for idx in \
    "${SERVER_DIST}/node_modules/.prisma/client/index.js" \
    "${SERVER_DIST}/node_modules/@prisma/client/index.js"; do
    [[ -f "$idx" ]] && printf '%s' "${ENUM_SHIM}" >> "${idx}" && echo "  Enum shim injected: ${idx}"
done

# Patch dist/lib/prisma.js with JSON serialization middleware.
PRISMA_LIB_JS="${SERVER_DIST}/dist/lib/prisma.js"
if [[ -f "${PRISMA_LIB_JS}" ]]; then
    cat > "${PRISMA_LIB_JS}" << 'EOFPRISMA'
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
const client_1 = require("@prisma/client");
const _base = new client_1.PrismaClient();
const _JSON_FIELDS = {
    ConnectorConfig:         ['config'],
    AIExtraction:            ['extractedTasks'],
    DocumentationSettings:   ['templates', 'customVariables'],
    ArchivedTask:            ['snapshot'],
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
_base.$use(async (params, next) => {
    _fixWrite(params.model, params.args);
    const r = await next(params);
    return _fixRead(params.model, r);
});
exports.prisma = _base;
EOFPRISMA
    echo "Patched dist/lib/prisma.js with JSON serialization middleware."
fi

# ── 3. Download Node.js ───────────────────────────────────────────────────────
NODE_DIR="${DIST}/node"
if [[ "${SKIP_DOWNLOADS}" == "true" && -d "${NODE_DIR}" ]]; then
    echo "Skipping Node.js download (already present)."
else
    step "Downloading Node.js v${NODE_VERSION} (Linux x64)"
    NODE_TAR="${INSTALLER}/node-v${NODE_VERSION}-linux-x64.tar.xz"
    NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz"

    if [[ ! -f "${NODE_TAR}" ]]; then
        curl -fL --progress-bar "${NODE_URL}" -o "${NODE_TAR}"
    fi

    [[ -d "${NODE_DIR}" ]] && rm -rf "${NODE_DIR}"
    mkdir -p "${DIST}"
    tar -xJf "${NODE_TAR}" -C "${DIST}"
    mv "${DIST}/node-v${NODE_VERSION}-linux-x64" "${NODE_DIR}"
    echo "Node.js extracted to: ${NODE_DIR}"
fi

# ── 4. AI component ───────────────────────────────────────────────────────────
if [[ "${SKIP_AI}" == "true" ]]; then
    echo "Skipping AI component build (SKIP_AI=true)."
else
    step "Building AI service with PyInstaller"
    AI_SRC="${ROOT}/ai-service/app.py"

    if [[ ! -f "${AI_SRC}" ]]; then
        echo "WARNING: AI service source not found at ${AI_SRC} — skipping."
    else
        (
            python3 -m pip install pyinstaller
            SPEC_FILE="${ROOT}/ai-service/ai-service.spec"
            if [[ ! -f "${SPEC_FILE}" ]]; then
                echo "ERROR: PyInstaller spec file not found: ${SPEC_FILE}" >&2
                exit 1
            fi
            cd "${ROOT}/ai-service"
            python3 -m PyInstaller "${SPEC_FILE}" \
                --distpath "${INSTALLER}/pyinstaller-dist" \
                --workpath "${INSTALLER}/pyinstaller-build" \
                --noconfirm
        ) || echo "WARNING: AI component build failed — will be excluded from installer."

        AI_DIST="${DIST}/ai-service"
        [[ -d "${AI_DIST}" ]] && rm -rf "${AI_DIST}"
        if [[ -d "${INSTALLER}/pyinstaller-dist/ai-service" ]]; then
            cp -r "${INSTALLER}/pyinstaller-dist/ai-service" "${AI_DIST}"
            echo "AI service bundled to: ${AI_DIST}"
        fi
    fi

    # ffmpeg (Linux static build)
    FFMPEG_DIR="${DIST}/ffmpeg"
    if [[ "${SKIP_DOWNLOADS}" == "true" && -f "${FFMPEG_DIR}/ffmpeg" ]]; then
        echo "Skipping ffmpeg download (already present)."
    else
        step "Downloading ffmpeg (Linux static)"
        FFMPEG_TAR="${INSTALLER}/ffmpeg-linux-amd64.tar.xz"
        FFMPEG_URL="https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz"

        if [[ ! -f "${FFMPEG_TAR}" ]]; then
            curl -fL --progress-bar "${FFMPEG_URL}" -o "${FFMPEG_TAR}"
        fi

        FFMPEG_STAGE="${INSTALLER}/ffmpeg-stage"
        [[ -d "${FFMPEG_STAGE}" ]] && rm -rf "${FFMPEG_STAGE}"
        mkdir -p "${FFMPEG_STAGE}"
        tar -xJf "${FFMPEG_TAR}" -C "${FFMPEG_STAGE}"
        mkdir -p "${FFMPEG_DIR}"
        FFMPEG_BIN=$(find "${FFMPEG_STAGE}" -name "ffmpeg" -type f | head -1)
        cp "${FFMPEG_BIN}" "${FFMPEG_DIR}/ffmpeg"
        chmod +x "${FFMPEG_DIR}/ffmpeg"
        rm -rf "${FFMPEG_STAGE}"
        echo "ffmpeg copied to: ${FFMPEG_DIR}"
    fi
fi

# ── 5. Check assets ───────────────────────────────────────────────────────────
step "Checking installer assets"
ASSETS_DIR="${INSTALLER}/assets"
SHARED_DIR="${INSTALLER}/../shared"
mkdir -p "${ASSETS_DIR}" "${SHARED_DIR}"

if [[ ! -f "${SHARED_DIR}/LICENSE.txt" ]]; then
    printf 'TaskMesh - All rights reserved.\nSee https://taskmesh.co for license terms.\n' \
        > "${SHARED_DIR}/LICENSE.txt"
    echo "Created placeholder shared/LICENSE.txt"
fi

# Generate a placeholder PNG icon using ImageMagick if present.
# Replace installer/linux/assets/taskmesh.png with a real asset before distributing.
PNG_ICON="${ASSETS_DIR}/taskmesh.png"
if [[ ! -f "${PNG_ICON}" ]] && command -v convert &>/dev/null; then
    convert -size 256x256 xc:'#6366F1' \
        -fill white -draw "circle 64,64 64,74"   \
        -fill white -draw "circle 128,64 128,74" \
        -fill white -draw "circle 192,64 192,74" \
        -fill white -draw "circle 64,128 64,138" \
        -fill white -draw "circle 128,128 128,138" \
        -fill white -draw "circle 192,128 192,138" \
        -fill white -draw "circle 64,192 64,202"   \
        -fill white -draw "circle 128,192 128,202" \
        -fill white -draw "circle 192,192 192,202" \
        "${PNG_ICON}" 2>/dev/null \
    && echo "Generated placeholder taskmesh.png (ImageMagick)" \
    || echo "INFO: ImageMagick convert failed — QtIFW will use its default icon."
fi

# ── 6. Populate QtIFW package data ────────────────────────────────────────────
step "Populating QtIFW package data"

CORE_DATA="${INSTALLER}/packages/com.taskmesh.core/data"
AI_DATA="${INSTALLER}/packages/com.taskmesh.ai/data"
mkdir -p "${CORE_DATA}" "${AI_DATA}"

# Core: node runtime + compiled server + scripts
echo "Copying core data..."
rm -rf "${CORE_DATA:?}/node" "${CORE_DATA:?}/server" "${CORE_DATA:?}/scripts"
cp -r "${DIST}/node"         "${CORE_DATA}/node"
cp -r "${DIST}/server"       "${CORE_DATA}/server"
cp -r "${INSTALLER}/scripts" "${CORE_DATA}/scripts"
chmod +x "${CORE_DATA}/scripts/"*.sh 2>/dev/null || true
echo "Core data populated."

# AI: ai-service binary + ffmpeg (only if built)
if [[ -d "${DIST}/ai-service" && -f "${DIST}/ffmpeg/ffmpeg" ]]; then
    echo "Copying AI data..."
    rm -rf "${AI_DATA:?}/ai-service" "${AI_DATA:?}/ffmpeg"
    cp -r "${DIST}/ai-service" "${AI_DATA}/ai-service"
    cp -r "${DIST}/ffmpeg"     "${AI_DATA}/ffmpeg"
    chmod +x "${AI_DATA}/ffmpeg/ffmpeg"
    echo "AI data populated."
else
    echo "INFO: AI component not built — AI package data directory will be empty."
fi

# ── 7. Build QtIFW installer binary ──────────────────────────────────────────
step "Building QtIFW installer"
mkdir -p "${OUTPUT_DIR}"
INSTALLER_BIN="${OUTPUT_DIR}/TaskMesh-Installer"

"${BINARYCREATOR}" \
    --offline-only \
    -c "${INSTALLER}/installer.xml" \
    -p "${INSTALLER}/packages" \
    "${INSTALLER_BIN}"

if [[ ! -f "${INSTALLER_BIN}" ]]; then
    echo "ERROR: binarycreator did not produce ${INSTALLER_BIN}" >&2
    exit 1
fi
chmod +x "${INSTALLER_BIN}"
echo "QtIFW installer built: ${INSTALLER_BIN}"

# ── 8. Package as .tar.gz ─────────────────────────────────────────────────────
step "Packaging installer as .tar.gz"
TARBALL="${OUTPUT_DIR}/TaskMesh-Installer.tar.gz"
(cd "${OUTPUT_DIR}" && tar -czf "TaskMesh-Installer.tar.gz" "TaskMesh-Installer")
SIZE=$(du -sh "${TARBALL}" | cut -f1)

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  BUILD COMPLETE"
echo "  Output : ${TARBALL}"
echo "  Size   : ${SIZE}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
