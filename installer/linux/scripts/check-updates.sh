#!/usr/bin/env bash
# TaskMesh Update Checker (Linux)
# Checks GitHub for a newer release and writes a notification if one is found.
# Intended to be run weekly via cron (registered by install-services.sh).
#
# No automatic download or install — just detection and notification.

set -euo pipefail

CONFIG_FILE="/etc/taskmesh/config"

# Read current version from config
CURRENT_VERSION="0.0.0"
if [[ -f "${CONFIG_FILE}" ]]; then
    CURRENT_VERSION=$(grep -m1 '^VERSION=' "${CONFIG_FILE}" | cut -d= -f2 || echo "0.0.0")
fi

# Fetch latest release tag from GitHub API
LATEST_TAG=$(curl -fsSL \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    "https://api.github.com/repos/MBarc/TaskMesh/releases/latest" \
    2>/dev/null | grep '"tag_name"' | head -1 | sed 's/.*"tag_name": *"\(.*\)".*/\1/') || LATEST_TAG=""

if [[ -z "${LATEST_TAG}" ]]; then
    exit 0  # Network unavailable or no releases yet — silently exit
fi

LATEST_VERSION="${LATEST_TAG#v}"

# Simple version comparison (works for semver X.Y.Z)
if [[ "${CURRENT_VERSION}" != "${LATEST_VERSION}" ]]; then
    NOTIFY_FILE="/var/lib/taskmesh/update-available"
    echo "${LATEST_VERSION}" > "${NOTIFY_FILE}"
fi
