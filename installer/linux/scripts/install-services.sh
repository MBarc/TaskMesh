#!/usr/bin/env bash
# TaskMesh Core Service Installer
# Registers taskmesh-server as a systemd service.
# AI components are handled separately by install-ai.sh.
# Called by the QtIFW installscript.qs after file extraction.
#
# Usage: install-services.sh <install-dir> <data-dir> [app-version]
#   install-dir  : e.g. /opt/taskmesh
#   data-dir     : e.g. /var/lib/taskmesh
#   app-version  : e.g. 1.0.0 (optional, falls back to server/package.json)

set -euo pipefail

INSTALL_DIR="${1:?Usage: $0 <install-dir> <data-dir> [app-version] [auto-update-enabled]}"
DATA_DIR="${2:?Usage: $0 <install-dir> <data-dir> [app-version] [auto-update-enabled]}"
AUTO_UPDATE_ENABLED="${4:-0}"   # 4th positional arg; defaults to disabled

# Resolve version: prefer explicit argument, fall back to dist package.json
if [[ -n "${3:-}" ]]; then
    APP_VERSION="${3}"
else
    PKG_JSON="${INSTALL_DIR}/server/package.json"
    if [[ -f "${PKG_JSON}" ]]; then
        APP_VERSION=$(grep '"version"' "${PKG_JSON}" | head -1 | sed 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
    fi
    APP_VERSION="${APP_VERSION:-0.0.0}"
fi

LOG_DIR="${INSTALL_DIR}/logs"
INSTALL_LOG="${LOG_DIR}/install.log"
mkdir -p "${LOG_DIR}"
exec > >(tee -a "${INSTALL_LOG}") 2>&1

echo "TaskMesh Install Script"
echo "InstallDir : ${INSTALL_DIR}"
echo "DataDir    : ${DATA_DIR}"
echo "Time       : $(date)"
echo "User       : $(whoami)"

NODE="${INSTALL_DIR}/node/bin/node"
SERVER_JS="${INSTALL_DIR}/server/dist/index.js"
DB_FILE="${DATA_DIR}/taskmesh.db"
DOCS_DIR="${DATA_DIR}/documentation"

echo "node exists   : $(test -f "${NODE}" && echo yes || echo no)"
echo "server exists : $(test -f "${SERVER_JS}" && echo yes || echo no)"

# ── Ensure data directories exist ────────────────────────────────────────────
mkdir -p "${DATA_DIR}" "${DOCS_DIR}"

# ── Auto-detect a free port starting from 4000 ───────────────────────────────
find_free_port() {
    local start="${1:-4000}"
    local port="${start}"
    while [[ "${port}" -le 65535 ]]; do
        if ! ss -tlnH "sport = :${port}" 2>/dev/null | grep -q "${port}" && \
           ! (echo "" | timeout 1 bash -c "cat > /dev/tcp/127.0.0.1/${port}") 2>/dev/null; then
            echo "${port}"
            return 0
        fi
        (( port++ )) || true
    done
    echo "4000"  # fallback — the service will handle the conflict at runtime
}

# Try port 80 first (enables http://taskmesh.localhost with no port suffix).
# Fall back to 4000+ if port 80 is unavailable.
if ! ss -tlnH "sport = :80" 2>/dev/null | grep -q "80" && \
   ! (echo "" | timeout 1 bash -c "cat > /dev/tcp/127.0.0.1/80") 2>/dev/null; then
    PORT=80
    echo "Port 80 is available -- using http://taskmesh.localhost"
else
    echo "Port 80 is not available -- falling back to 4000+"
    PORT=$(find_free_port 4000)
    if [[ "${PORT}" != "4000" ]]; then
        echo "Port 4000 is in use — using port ${PORT} instead."
    fi
fi
echo "Selected port: ${PORT}"
APP_URL=$( [[ "${PORT}" == "80" ]] && echo "http://taskmesh.localhost" || echo "http://taskmesh.localhost:${PORT}" )
echo "App URL: ${APP_URL}"

# ── Write config file ────────────────────────────────────────────────────────
# Config is read by start-taskmesh.sh and the systemd unit on startup.
mkdir -p /etc/taskmesh
cat > /etc/taskmesh/config << EOFCONFIG
INSTALL_DIR=${INSTALL_DIR}
DATA_DIR=${DATA_DIR}
PORT=${PORT}
APP_URL=${APP_URL}
VERSION=${APP_VERSION}
AUTO_UPDATE_ENABLED=${AUTO_UPDATE_ENABLED}
EOFCONFIG
echo "Config written to /etc/taskmesh/config"

# Add taskmesh.localhost to the OS hosts file (idempotent)
HOSTS_ENTRY="127.0.0.1   taskmesh.localhost"
if grep -q "taskmesh\.localhost" /etc/hosts 2>/dev/null; then
    echo "taskmesh.localhost already in /etc/hosts -- skipping."
else
    echo "${HOSTS_ENTRY}" >> /etc/hosts
    echo "Added taskmesh.localhost to /etc/hosts."
fi

# ── Initialize SQLite database via Prisma ────────────────────────────────────
echo "Initializing database..."
export DATABASE_URL="file:${DB_FILE}"
export NODE_ENV="production"
(
    cd "${INSTALL_DIR}/server"
    "${NODE}" node_modules/prisma/build/index.js db push --accept-data-loss 2>&1 || true
)
if [[ -f "${DB_FILE}" ]]; then
    echo "Database initialized at: ${DB_FILE}"
else
    echo "WARNING: Prisma ran but DB file not found — will initialize on first launch."
fi
unset DATABASE_URL NODE_ENV

# ── Write systemd service unit ────────────────────────────────────────────────
cat > /etc/systemd/system/taskmesh-server.service << EOFUNIT
[Unit]
Description=TaskMesh Server
After=network.target
Wants=network.target

[Service]
Type=simple
ExecStart=${NODE} ${SERVER_JS}
WorkingDirectory=${INSTALL_DIR}/server
Environment=NODE_ENV=production
Environment=DATABASE_URL=file:${DB_FILE}
Environment=AI_SERVICE_URL=http://localhost:8000
Environment=PORT=${PORT}
Environment=DOCUMENTATION_PATH=${DOCS_DIR}
Restart=on-failure
RestartSec=5
KillMode=process
StandardOutput=append:${LOG_DIR}/taskmesh-server-stdout.log
StandardError=append:${LOG_DIR}/taskmesh-server-stderr.log

[Install]
WantedBy=multi-user.target
EOFUNIT

echo "systemd unit written: /etc/systemd/system/taskmesh-server.service"

# ── Enable and start service ──────────────────────────────────────────────────
systemctl daemon-reload
systemctl enable taskmesh-server
systemctl restart taskmesh-server

# ── Auto-update cron entry (only when enabled) ───────────────────────────────
# The in-app settings toggle also manages this file at runtime via the server API.
CRON_FILE="/etc/cron.d/taskmesh"
UPDATE_SCRIPT="${INSTALL_DIR}/scripts/check-updates.sh"

rm -f "${CRON_FILE}"
if [[ "${AUTO_UPDATE_ENABLED}" == "1" && -f "${UPDATE_SCRIPT}" ]]; then
    cat > "${CRON_FILE}" << EOFCRON
# TaskMesh weekly auto-update (managed by TaskMesh — do not edit manually)
0 9 * * 0 root bash ${UPDATE_SCRIPT}
EOFCRON
    echo "Weekly auto-update cron entry written to ${CRON_FILE}."
else
    echo "Auto-update disabled — cron entry not created."
fi

echo ""
echo "TaskMesh install script complete."
echo "Server should be available at ${APP_URL}"
echo "Install log: ${INSTALL_LOG}"
