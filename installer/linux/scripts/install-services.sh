#!/usr/bin/env bash
# TaskMesh Core Service Installer
# Registers taskmesh-server as a systemd service.
# AI components are handled separately by install-ai.sh.
# Called by the QtIFW installscript.qs after file extraction.
#
# Usage: install-services.sh <install-dir> <data-dir>
#   install-dir : e.g. /opt/taskmesh
#   data-dir    : e.g. /var/lib/taskmesh

set -euo pipefail

INSTALL_DIR="${1:?Usage: $0 <install-dir> <data-dir>}"
DATA_DIR="${2:?Usage: $0 <install-dir> <data-dir>}"

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

PORT=$(find_free_port 4000)
if [[ "${PORT}" != "4000" ]]; then
    echo "Port 4000 is in use — using port ${PORT} instead."
fi
echo "Selected port: ${PORT}"

# ── Write config file ────────────────────────────────────────────────────────
# Config is read by start-taskmesh.sh and the systemd unit on startup.
mkdir -p /etc/taskmesh
cat > /etc/taskmesh/config << EOFCONFIG
INSTALL_DIR=${INSTALL_DIR}
DATA_DIR=${DATA_DIR}
PORT=${PORT}
VERSION=1.0.0
EOFCONFIG
echo "Config written to /etc/taskmesh/config"

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

echo ""
echo "TaskMesh install script complete."
echo "Server should be available at http://localhost:${PORT}"
echo "Install log: ${INSTALL_LOG}"
