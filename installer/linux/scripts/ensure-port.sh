#!/usr/bin/env bash
# Finds a free TCP port starting from 4000 and prints it.
# Used by install-services.sh; also callable standalone for diagnostics.
#
# Usage: ensure-port.sh [start-port]
# Output: prints the first free port to stdout

START="${1:-4000}"
PORT="${START}"

while [[ "${PORT}" -le 65535 ]]; do
    # ss is available on all modern Linux distros
    if ! ss -tlnH 2>/dev/null | awk '{print $4}' | grep -q ":${PORT}$"; then
        # Confirm with a real bind attempt
        if ! (bash -c "exec 3<>/dev/tcp/127.0.0.1/${PORT}" 2>/dev/null); then
            echo "${PORT}"
            exit 0
        fi
    fi
    (( PORT++ )) || true
done

echo "${START}"  # fallback
