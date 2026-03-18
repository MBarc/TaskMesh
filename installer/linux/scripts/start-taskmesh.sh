#!/usr/bin/env bash
# Opens TaskMesh in the default browser.
# Used as the .desktop Exec= entry and the /usr/local/bin/taskmesh symlink target.

CONFIG_FILE="/etc/taskmesh/config"

PORT="4000"
if [[ -f "${CONFIG_FILE}" ]]; then
    PORT=$(grep -m1 '^PORT=' "${CONFIG_FILE}" | cut -d= -f2 || echo "4000")
fi

if [[ "${PORT}" == "80" ]]; then
    URL="http://taskmesh.localhost"
else
    URL="http://taskmesh.localhost:${PORT}"
fi

# Prefer xdg-open, fall back to common browser executables
if command -v xdg-open &>/dev/null; then
    xdg-open "${URL}"
elif command -v sensible-browser &>/dev/null; then
    sensible-browser "${URL}"
elif command -v firefox &>/dev/null; then
    firefox "${URL}" &
elif command -v google-chrome &>/dev/null; then
    google-chrome "${URL}" &
elif command -v chromium-browser &>/dev/null; then
    chromium-browser "${URL}" &
else
    echo "TaskMesh is running at ${URL}" >&2
    echo "Open that URL in your browser to access TaskMesh." >&2
fi
