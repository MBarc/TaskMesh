#!/usr/bin/env bash
# TaskMesh Update Checker (Linux)
# Downloads and installs a new release when one is available.
# Intended to be run weekly via cron (registered by install-services.sh).

set -uo pipefail

CONFIG_FILE="/etc/taskmesh/config"
TMP_DIR=""

cleanup() {
  if [[ -n "${TMP_DIR}" && -d "${TMP_DIR}" ]]; then
    rm -rf "${TMP_DIR}"
  fi
}
trap cleanup EXIT

# ── Read config ───────────────────────────────────────────────────────────────

CURRENT_VERSION="0.0.0"
INSTALL_DIR="/opt/taskmesh"
DATA_DIR="/var/lib/taskmesh"

if [[ -f "${CONFIG_FILE}" ]]; then
  _val=$(grep -m1 '^VERSION=' "${CONFIG_FILE}" 2>/dev/null | cut -d= -f2) && CURRENT_VERSION="${_val:-0.0.0}"
  _val=$(grep -m1 '^INSTALL_DIR=' "${CONFIG_FILE}" 2>/dev/null | cut -d= -f2) && INSTALL_DIR="${_val:-/opt/taskmesh}"
  _val=$(grep -m1 '^DATA_DIR=' "${CONFIG_FILE}" 2>/dev/null | cut -d= -f2) && DATA_DIR="${_val:-/var/lib/taskmesh}"
fi

# ── Fetch latest release metadata ────────────────────────────────────────────

RELEASE_JSON=$(curl -fsSL \
  --max-time 30 \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/MBarc/TaskMesh/releases/latest" \
  2>/dev/null) || RELEASE_JSON=""

if [[ -z "${RELEASE_JSON}" ]]; then
  exit 0  # Network unavailable or no releases yet — silently exit
fi

LATEST_TAG=$(printf '%s' "${RELEASE_JSON}" | grep '"tag_name"' | head -1 | sed 's/.*"tag_name": *"\(.*\)".*/\1/')

if [[ -z "${LATEST_TAG}" ]]; then
  exit 0
fi

LATEST_VERSION="${LATEST_TAG#v}"

# ── Version comparison ────────────────────────────────────────────────────────

version_gt() {
  # Returns 0 (true) if $1 > $2 using semver ordering
  local IFS=.
  read -r -a a <<< "$1"
  read -r -a b <<< "$2"
  local i
  for (( i=0; i < ${#a[@]} || i < ${#b[@]}; i++ )); do
    local av=${a[i]:-0}
    local bv=${b[i]:-0}
    if (( av > bv )); then return 0; fi
    if (( av < bv )); then return 1; fi
  done
  return 1  # equal → not greater
}

if ! version_gt "${LATEST_VERSION}" "${CURRENT_VERSION}"; then
  exit 0  # Already up to date — exit silently
fi

# ── Find asset URL ────────────────────────────────────────────────────────────

ASSET_URL=$(printf '%s' "${RELEASE_JSON}" | grep '"browser_download_url"' | grep 'TaskMesh-Installer\.tar\.gz' | head -1 | sed 's/.*"browser_download_url": *"\(.*\)".*/\1/')

if [[ -z "${ASSET_URL}" ]]; then
  logger -t taskmesh-update "Update to ${LATEST_VERSION} available but no TaskMesh-Installer.tar.gz asset found in release."
  exit 0
fi

# ── Download ──────────────────────────────────────────────────────────────────

TMP_DIR=$(mktemp -d "/tmp/taskmesh-update-${LATEST_VERSION}.XXXXXX")
ARCHIVE="${TMP_DIR}/TaskMesh-Installer.tar.gz"

logger -t taskmesh-update "Downloading TaskMesh ${LATEST_VERSION} from ${ASSET_URL}"

if ! curl -fsSL --max-time 300 -o "${ARCHIVE}" "${ASSET_URL}" 2>/dev/null; then
  logger -t taskmesh-update "Download failed — will retry next scheduled run."
  exit 0
fi

# ── Extract ───────────────────────────────────────────────────────────────────

EXTRACT_DIR="${TMP_DIR}/extracted"
mkdir -p "${EXTRACT_DIR}"

if ! tar -xzf "${ARCHIVE}" -C "${EXTRACT_DIR}" 2>/dev/null; then
  logger -t taskmesh-update "Extraction failed — archive may be corrupt."
  exit 0
fi

# ── Install ───────────────────────────────────────────────────────────────────

# Look for an installer script inside the extracted directory
INSTALL_SCRIPT=""
for candidate in install.sh install-services.sh; do
  found=$(find "${EXTRACT_DIR}" -maxdepth 3 -name "${candidate}" 2>/dev/null | head -1)
  if [[ -n "${found}" ]]; then
    INSTALL_SCRIPT="${found}"
    break
  fi
done

if [[ -n "${INSTALL_SCRIPT}" ]]; then
  logger -t taskmesh-update "Running installer script: ${INSTALL_SCRIPT}"
  chmod +x "${INSTALL_SCRIPT}"
  if ! "${INSTALL_SCRIPT}" --install-dir "${INSTALL_DIR}" --data-dir "${DATA_DIR}" 2>/dev/null; then
    logger -t taskmesh-update "Installer script exited non-zero — update may be incomplete."
    exit 0
  fi
else
  # Fallback: copy server/client files and restart the service
  logger -t taskmesh-update "No install script found — copying files directly."

  for subdir in server client; do
    src=$(find "${EXTRACT_DIR}" -maxdepth 3 -type d -name "${subdir}" 2>/dev/null | head -1)
    if [[ -n "${src}" && -d "${INSTALL_DIR}/${subdir}" ]]; then
      rsync -a --delete "${src}/" "${INSTALL_DIR}/${subdir}/" 2>/dev/null || true
    fi
  done

  if systemctl is-active --quiet taskmesh 2>/dev/null; then
    systemctl restart taskmesh 2>/dev/null || true
    logger -t taskmesh-update "taskmesh service restarted."
  fi
fi

# ── Update config with new version ───────────────────────────────────────────

if [[ -f "${CONFIG_FILE}" ]]; then
  if grep -q '^VERSION=' "${CONFIG_FILE}"; then
    sed -i "s/^VERSION=.*/VERSION=${LATEST_VERSION}/" "${CONFIG_FILE}"
  else
    printf '\nVERSION=%s\n' "${LATEST_VERSION}" >> "${CONFIG_FILE}"
  fi
fi

logger -t taskmesh-update "Successfully updated TaskMesh from ${CURRENT_VERSION} to ${LATEST_VERSION}."
