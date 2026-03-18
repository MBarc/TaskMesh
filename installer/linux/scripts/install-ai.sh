#!/usr/bin/env bash
# TaskMesh AI Component Installer
# Downloads Ollama, registers it as a systemd service, pulls the LLM model,
# then registers and starts the TaskMesh-AI service.
#
# Runs in a visible terminal window so the user can see ~2.5 GB download progress.
# Called by the QtIFW installscript.qs (AI component only).
#
# Usage: install-ai.sh <install-dir> [ollama-model]
#   install-dir  : e.g. /opt/taskmesh
#   ollama-model : e.g. qwen2.5:3b  (default)

set -euo pipefail

INSTALL_DIR="${1:?Usage: $0 <install-dir> [ollama-model]}"
OLLAMA_MODEL="${2:-}"   # empty = auto-detect via detect-hardware.sh
LOG_DIR="${INSTALL_DIR}/logs"
mkdir -p "${LOG_DIR}"

step() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  $1"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# ── Step 0: Detect hardware and select Ollama model ──────────────────────────
step "Detecting hardware for AI model selection"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DETECT_SCRIPT="${SCRIPT_DIR}/detect-hardware.sh"

if [[ -z "${OLLAMA_MODEL}" ]]; then
    if [[ -x "${DETECT_SCRIPT}" ]]; then
        OLLAMA_MODEL="$("${DETECT_SCRIPT}")"
        echo "Hardware detection selected model: ${OLLAMA_MODEL}"
    else
        echo "WARNING: detect-hardware.sh not found — using default: llama3.1:8b"
        OLLAMA_MODEL="llama3.1:8b"
    fi
else
    echo "Using specified model: ${OLLAMA_MODEL}"
fi

if [[ "${OLLAMA_MODEL}" == "disabled" ]]; then
    echo ""
    echo "WARNING: Your system has less than 8 GB of RAM."
    echo "         AI features require at least 8 GB RAM and will not be installed."
    echo "         You can enable them later by upgrading your hardware and"
    echo "         re-running the AI setup from the TaskMesh settings panel."
    echo ""
    exit 0
fi

echo "Selected model: ${OLLAMA_MODEL}"

# ── Step 1: Find or install Ollama ────────────────────────────────────────────
step "Setting up Ollama AI engine"

OLLAMA_EXE=""
for candidate in /usr/local/bin/ollama /usr/bin/ollama; do
    if [[ -x "${candidate}" ]]; then
        OLLAMA_EXE="${candidate}"
        break
    fi
done

INSTALLED_OLLAMA=false
if [[ -z "${OLLAMA_EXE}" ]]; then
    echo "Downloading Ollama for Linux..."
    echo "(This is approximately 500 MB — please wait)"
    curl -fsSL https://ollama.com/install.sh | sh
    INSTALLED_OLLAMA=true

    for candidate in /usr/local/bin/ollama /usr/bin/ollama; do
        if [[ -x "${candidate}" ]]; then
            OLLAMA_EXE="${candidate}"
            break
        fi
    done

    if [[ -z "${OLLAMA_EXE}" ]]; then
        echo "ERROR: Ollama installation failed — executable not found after install." >&2
        exit 1
    fi
    echo "Ollama installed at: ${OLLAMA_EXE}"

    # Record that TaskMesh installed Ollama so the uninstaller can offer to remove it.
    echo "INSTALLED_BY_TASKMESH=true" >> /etc/taskmesh/config
else
    echo "Ollama already installed at: ${OLLAMA_EXE}"
    # Don't set INSTALLED_BY_TASKMESH — we didn't install it, so we shouldn't remove it.
fi

# ── Step 2: Register Ollama as a systemd service ──────────────────────────────
step "Registering Ollama service"

cat > /etc/systemd/system/taskmesh-ollama.service << EOFUNIT
[Unit]
Description=Ollama LLM backend for TaskMesh AI features
After=network.target

[Service]
Type=simple
ExecStart=${OLLAMA_EXE} serve
Environment=OLLAMA_HOST=127.0.0.1:11434
Restart=on-failure
RestartSec=5
StandardOutput=append:${LOG_DIR}/taskmesh-ollama-stdout.log
StandardError=append:${LOG_DIR}/taskmesh-ollama-stderr.log

[Install]
WantedBy=multi-user.target
EOFUNIT

systemctl daemon-reload
systemctl enable taskmesh-ollama
systemctl restart taskmesh-ollama
echo "Ollama service started."

# ── Step 3: Wait for Ollama to be ready ──────────────────────────────────────
echo ""
echo "Waiting for Ollama to be ready..."
READY=false
for i in $(seq 1 30); do
    if curl -sf "http://localhost:11434" &>/dev/null; then
        READY=true
        break
    fi
    sleep 2
done

if [[ "${READY}" != "true" ]]; then
    echo "WARNING: Ollama did not respond after 60 s. AI features may not work until it starts."
fi

# ── Step 4: Pull AI language model ───────────────────────────────────────────
# Tier order for fallback on pull failure (highest to lowest).
ALL_TIERS=("qwen2.5:32b" "qwen2.5:14b" "llama3.1:8b" "llama3.2:3b")
MODEL_READY=false

step "Downloading AI language model: ${OLLAMA_MODEL}"
echo "(This may be 2–20 GB depending on the model — please wait)"
echo ""

pull_model() {
    "${OLLAMA_EXE}" pull "$1"
}

if pull_model "${OLLAMA_MODEL}"; then
    echo ""
    echo "Model '${OLLAMA_MODEL}' ready."
    MODEL_READY=true
else
    echo "WARNING: Model pull failed for '${OLLAMA_MODEL}'."

    # Find this tier in the list and try the next one down.
    tier_idx=-1
    for i in "${!ALL_TIERS[@]}"; do
        if [[ "${ALL_TIERS[$i]}" == "${OLLAMA_MODEL}" ]]; then
            tier_idx=${i}
            break
        fi
    done

    fallback_pulled=false
    if (( tier_idx >= 0 && tier_idx < ${#ALL_TIERS[@]} - 1 )); then
        FALLBACK="${ALL_TIERS[$(( tier_idx + 1 ))]}"
        echo "Retrying with fallback model: ${FALLBACK}"
        echo ""
        if pull_model "${FALLBACK}"; then
            OLLAMA_MODEL="${FALLBACK}"
            echo ""
            echo "Model '${OLLAMA_MODEL}' ready (fallback)."
            MODEL_READY=true
            fallback_pulled=true
        else
            echo "WARNING: Fallback model pull also failed."
        fi
    fi

    if [[ "${MODEL_READY}" != "true" ]]; then
        echo "         AI language features will not work until a model is downloaded."
        echo "         Retry later: ollama pull ${OLLAMA_MODEL}"
    fi
fi

# ── Step 5: Register TaskMesh-AI service ─────────────────────────────────────
step "Registering TaskMesh-AI service"

if [[ "${MODEL_READY}" != "true" ]]; then
    echo "Skipping TaskMesh-AI service — model was not downloaded successfully."
    echo "Re-run 'ollama pull ${OLLAMA_MODEL}' then restart taskmesh-ai to enable AI features."
else
    AI_EXE="${INSTALL_DIR}/ai-service/ai-service"
    if [[ ! -x "${AI_EXE}" ]]; then
        echo "WARNING: AI service executable not found at ${AI_EXE} — skipping service registration."
    else
        WHISPER_MODEL_DIR="${INSTALL_DIR}/ai-service/models"
        mkdir -p "${WHISPER_MODEL_DIR}"

        cat > /etc/systemd/system/taskmesh-ai.service << EOFUNIT
[Unit]
Description=TaskMesh AI Service
After=network.target taskmesh-ollama.service
Wants=taskmesh-ollama.service

[Service]
Type=simple
ExecStart=${AI_EXE}
WorkingDirectory=${INSTALL_DIR}/ai-service
Environment=OLLAMA_HOST=http://localhost:11434
Environment=OLLAMA_MODEL=${OLLAMA_MODEL}
Environment=WHISPER_MODEL=tiny
Environment=WHISPER_MODEL_DIR=${WHISPER_MODEL_DIR}
Environment=TASKMESH_PRELOAD_MODELS=1
Restart=on-failure
RestartSec=5
StandardOutput=append:${LOG_DIR}/taskmesh-ai-stdout.log
StandardError=append:${LOG_DIR}/taskmesh-ai-stderr.log

[Install]
WantedBy=multi-user.target
EOFUNIT

        systemctl daemon-reload
        systemctl enable taskmesh-ai
        systemctl start taskmesh-ai
        echo "TaskMesh-AI service started."
        echo "(Whisper transcription model downloads on first use)"
    fi
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  AI components installed successfully."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Press Enter to close this window."
read -r
