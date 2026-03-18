#!/usr/bin/env bash
# detect-hardware.sh
# Detects available RAM and GPU VRAM and outputs the best Ollama model for this machine.
# Output: one line — the model tag (e.g. "llama3.1:8b") or "disabled".
#
# Tier mapping:
#   < 8 GB RAM              → disabled
#   8–15 GB RAM / no GPU    → llama3.2:3b
#   16–31 GB RAM / 4–7 GB VRAM → llama3.1:8b
#   32+ GB RAM / 8–15 GB VRAM  → qwen2.5:14b
#   16+ GB VRAM             → qwen2.5:32b
#
# GPU VRAM takes priority over RAM when a GPU is present.
# Falls back to RAM-only logic if GPU detection fails.
# No external dependencies — uses only native Linux tooling.

set -uo pipefail

# ── Detect RAM ────────────────────────────────────────────────────────────────
ram_kb=$(grep MemTotal /proc/meminfo | awk '{print $2}')
ram_gb=$(( ram_kb / 1048576 ))

# ── Detect GPU VRAM ───────────────────────────────────────────────────────────
vram_gb=0

# Try NVIDIA via nvidia-smi (bundled with NVIDIA drivers).
if command -v nvidia-smi &>/dev/null; then
    vram_mib=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits 2>/dev/null \
               | head -1 | tr -d ' \r')
    if [[ "${vram_mib}" =~ ^[0-9]+$ ]]; then
        vram_gb=$(( vram_mib / 1024 ))
    fi
fi

# Try AMD via /sys (no rocm-smi dependency needed).
if (( vram_gb == 0 )); then
    for f in /sys/class/drm/card*/device/mem_info_vram_total; do
        [[ -r "${f}" ]] || continue
        vram_bytes=$(cat "${f}" 2>/dev/null || echo 0)
        if [[ "${vram_bytes}" =~ ^[0-9]+$ ]] && (( vram_bytes > 0 )); then
            candidate=$(( vram_bytes / 1073741824 ))
            (( candidate > vram_gb )) && vram_gb=${candidate}
        fi
    done
fi

# ── Model selection ───────────────────────────────────────────────────────────
# GPU VRAM takes priority when a GPU is detected.
if   (( vram_gb >= 16 )); then model="qwen2.5:32b"
elif (( vram_gb >= 8  )); then model="qwen2.5:14b"
elif (( vram_gb >= 4  )); then model="llama3.1:8b"
elif (( ram_gb  >= 32 )); then model="qwen2.5:14b"
elif (( ram_gb  >= 16 )); then model="llama3.1:8b"
elif (( ram_gb  >= 8  )); then model="llama3.2:3b"
else                           model="disabled"
fi

echo "${model}"
