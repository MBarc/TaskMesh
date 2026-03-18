/**
 * TaskMesh AI Component — Qt Installer Framework install script
 *
 * Runs after QtIFW extracts the AI data (ai-service binary + ffmpeg).
 * Delegates to install-ai.sh which downloads Ollama, registers it as a
 * systemd service, pulls the language model, and starts TaskMesh-AI.
 *
 * Model selection flow:
 *   1. Component() constructor runs inline hardware detection (RAM + GPU VRAM)
 *      and stores the recommended tier in installer value "OllamaModel.Detected".
 *   2. AIModelPage.qml shows the user a radio-button list pre-selected to the
 *      recommended tier; the user's choice is stored in "OllamaModel".
 *   3. createOperations() reads "OllamaModel" and passes it to install-ai.sh
 *      as a second argument so the correct model is pulled.
 *
 * CLI silent mode: pass --OllamaModel=<tag> on the installer command line to
 * skip the wizard page and use a fixed model (e.g. for automated deployments).
 * Valid tags: qwen2.5:32b  qwen2.5:14b  llama3.1:8b  llama3.2:3b  disabled
 */

// ── Inline hardware detection ─────────────────────────────────────────────────
// Mirrors detect-hardware.sh tier logic.
// Runs in the constructor before any files are extracted, so we cannot call
// the bundled script — the detection is reimplemented here in JS.
//
// installer.execute(program, args) returns [exitCode, stdOut, stdErr] in QtIFW 4+
// and [exitCode] in older versions. We guard every call with try/catch and
// treat any failure as "detection unavailable" (falls back to llama3.1:8b).
function detectHardware()
{
    var ramGB  = 0;
    var vramGB = 0;

    // ── RAM ───────────────────────────────────────────────────────────────────
    try {
        var ramResult = installer.execute(
            "/bin/bash",
            ["-c", "awk '/MemTotal/{print int($2/1048576)}' /proc/meminfo"]);
        if (ramResult && ramResult.length > 1) {
            var parsed = parseInt(ramResult[1].trim(), 10);
            if (!isNaN(parsed)) ramGB = parsed;
        }
    } catch (e) {}

    // ── GPU VRAM — NVIDIA via nvidia-smi ─────────────────────────────────────
    try {
        var nvResult = installer.execute(
            "/bin/bash",
            ["-c",
             "command -v nvidia-smi >/dev/null 2>&1 && " +
             "nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits " +
             "2>/dev/null | head -1 | tr -d ' \\r'"]);
        if (nvResult && nvResult.length > 1) {
            var mib = parseInt(nvResult[1].trim(), 10);
            if (!isNaN(mib) && mib > 0)
                vramGB = Math.floor(mib / 1024);
        }
    } catch (e) {}

    // ── GPU VRAM — AMD via /sys (no rocm-smi needed) ─────────────────────────
    if (vramGB === 0) {
        try {
            var amdResult = installer.execute(
                "/bin/bash",
                ["-c",
                 "for f in /sys/class/drm/card*/device/mem_info_vram_total; do " +
                 "  [ -r \"$f\" ] && cat \"$f\"; " +
                 "done 2>/dev/null | sort -n | tail -1"]);
            if (amdResult && amdResult.length > 1) {
                var bytes = parseInt(amdResult[1].trim(), 10);
                if (!isNaN(bytes) && bytes > 0)
                    vramGB = Math.floor(bytes / 1073741824);
            }
        } catch (e) {}
    }

    // ── Tier selection (matches detect-hardware.sh) ───────────────────────────
    if (vramGB >= 16) return "qwen2.5:32b";
    if (vramGB >= 8)  return "qwen2.5:14b";
    if (vramGB >= 4)  return "llama3.1:8b";
    if (ramGB  >= 32) return "qwen2.5:14b";
    if (ramGB  >= 16) return "llama3.1:8b";
    if (ramGB  >= 8)  return "llama3.2:3b";
    if (ramGB  === 0) return "llama3.1:8b";  // detection failed — safe default
    return "disabled";
}

// ── Component constructor ─────────────────────────────────────────────────────
function Component()
{
    // Run hardware detection and store the recommended model.
    var detected = detectHardware();
    installer.setValue("OllamaModel.Detected", detected);

    // Only set OllamaModel if it hasn't already been supplied via CLI
    // (--OllamaModel=<tag> on the installer command line).
    if (installer.value("OllamaModel", "") === "")
        installer.setValue("OllamaModel", detected);

    // Insert the model selection page immediately after component selection.
    // QtIFW automatically hides/skips this page in unattended (silent) mode.
    installer.addWizardPage(component, "AIModelPage", QInstaller.ComponentSelection + 1);
}

// ── createOperations ──────────────────────────────────────────────────────────
Component.prototype.createOperations = function()
{
    // Default file extraction from data/
    component.createOperations();

    var installDir = installer.value("TargetDir");
    var model      = installer.value("OllamaModel", "llama3.1:8b");

    // Make AI service binary and ffmpeg executable
    component.addElevatedOperation("Execute",
        "/bin/chmod", "+x", installDir + "/ai-service/ai-service");

    component.addElevatedOperation("Execute",
        "/bin/chmod", "+x", installDir + "/ffmpeg/ffmpeg");

    // Run install-ai.sh in a visible terminal.
    // Passes the user-selected (or hardware-detected) model as the second argument.
    // Terminal preference: x-terminal-emulator (Debian/Ubuntu) → gnome-terminal → xterm.
    component.addElevatedOperation("Execute",
        "/bin/bash", "-c",
        "if command -v x-terminal-emulator &>/dev/null; then " +
            "x-terminal-emulator -e " +
            "'bash \"" + installDir + "/scripts/install-ai.sh\"" +
            " \"" + installDir + "\" \"" + model + "\"'; " +
        "elif command -v gnome-terminal &>/dev/null; then " +
            "gnome-terminal -- bash " +
            "\"" + installDir + "/scripts/install-ai.sh\"" +
            " \"" + installDir + "\" \"" + model + "\"; " +
        "else " +
            "xterm -e " +
            "'bash \"" + installDir + "/scripts/install-ai.sh\"" +
            " \"" + installDir + "\" \"" + model + "\"'; " +
        "fi",
        "UNDOEXECUTE",
        "/bin/bash",
        installDir + "/scripts/uninstall-ollama.sh");
};
