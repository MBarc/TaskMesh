#!/usr/bin/env bash
# TaskMesh Core Service Uninstaller
# Stops and removes systemd units registered by install-services.sh.
# Called by the QtIFW uninstall UNDOEXECUTE operation.
#
# Usage: uninstall-services.sh <install-dir>

set -euo pipefail

INSTALL_DIR="${1:?Usage: $0 <install-dir>}"

echo "TaskMesh Uninstall Script"
echo "InstallDir : ${INSTALL_DIR}"
echo "Time       : $(date)"

# ── Stop and disable core service ────────────────────────────────────────────
for svc in taskmesh-server taskmesh-ai taskmesh-ollama; do
    if systemctl is-active --quiet "${svc}" 2>/dev/null; then
        echo "Stopping ${svc}..."
        systemctl stop "${svc}" || true
    fi
    if systemctl is-enabled --quiet "${svc}" 2>/dev/null; then
        echo "Disabling ${svc}..."
        systemctl disable "${svc}" || true
    fi
done

# ── Remove unit files ─────────────────────────────────────────────────────────
for unit_file in \
    /etc/systemd/system/taskmesh-server.service \
    /etc/systemd/system/taskmesh-ai.service \
    /etc/systemd/system/taskmesh-ollama.service; do
    if [[ -f "${unit_file}" ]]; then
        rm -f "${unit_file}"
        echo "Removed: ${unit_file}"
    fi
done

systemctl daemon-reload

# ── Remove config ─────────────────────────────────────────────────────────────
rm -f /etc/taskmesh/config
rmdir /etc/taskmesh 2>/dev/null || true

# ── Remove desktop entry and CLI symlink ─────────────────────────────────────
rm -f /usr/share/applications/taskmesh.desktop
rm -f /usr/local/bin/taskmesh

# ── Remove startup entry if present (cron-based auto-update) ─────────────────
CRON_TAG="# taskmesh-update"
if crontab -l 2>/dev/null | grep -q "${CRON_TAG}"; then
    crontab -l 2>/dev/null | grep -v "${CRON_TAG}" | crontab - || true
    echo "Removed cron auto-update entry."
fi

# NOTE: User data (/var/lib/taskmesh) is NOT removed here.
# The QtIFW uninstaller prompts the user separately about data removal.
echo ""
echo "TaskMesh services uninstalled."
