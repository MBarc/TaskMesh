#!/usr/bin/env bash
# TaskMesh Ollama Uninstaller
# Removes Ollama only if TaskMesh was the one that originally installed it
# (i.e. INSTALLED_BY_TASKMESH=true in /etc/taskmesh/config).
# Called by the QtIFW UNDOEXECUTE for the AI component.
#
# Usage: uninstall-ollama.sh

set -euo pipefail

CONFIG_FILE="/etc/taskmesh/config"

# Only remove Ollama if we installed it
if [[ -f "${CONFIG_FILE}" ]]; then
    INSTALLED_BY_TASKMESH=$(grep -m1 '^INSTALLED_BY_TASKMESH=' "${CONFIG_FILE}" | cut -d= -f2 || echo "false")
else
    INSTALLED_BY_TASKMESH="false"
fi

if [[ "${INSTALLED_BY_TASKMESH}" != "true" ]]; then
    echo "Ollama was not installed by TaskMesh — leaving it in place."
    exit 0
fi

echo "TaskMesh Ollama Uninstaller"
echo "Removing Ollama (installed by TaskMesh)..."

# Stop and disable service
for svc in taskmesh-ollama ollama; do
    systemctl stop    "${svc}" 2>/dev/null || true
    systemctl disable "${svc}" 2>/dev/null || true
done

# Remove service unit if it exists under taskmesh namespace
rm -f /etc/systemd/system/taskmesh-ollama.service

# Attempt Ollama self-uninstall (if supported)
if command -v ollama &>/dev/null; then
    # Ollama does not ship an uninstall script; remove the binary directly.
    OLLAMA_EXE="$(command -v ollama)"
    rm -f "${OLLAMA_EXE}"
    echo "Removed: ${OLLAMA_EXE}"
fi

# Remove Ollama data directories (models are large — prompt handled by QtIFW UI)
rm -rf /usr/local/lib/ollama 2>/dev/null || true
rm -rf /var/lib/ollama       2>/dev/null || true

systemctl daemon-reload

echo "Ollama removed."
