/**
 * TaskMesh AI Component — Qt Installer Framework install script
 *
 * Runs after QtIFW extracts the AI data (ai-service binary + ffmpeg).
 * Delegates to install-ai.sh which downloads Ollama, registers it as a
 * systemd service, pulls the language model, and starts TaskMesh-AI.
 */

function Component()
{
    // Constructor
}

Component.prototype.createOperations = function()
{
    // Default file extraction from data/
    component.createOperations();

    var installDir = installer.value("TargetDir");

    // Make AI service binary and ffmpeg executable
    component.addElevatedOperation("Execute",
        "/bin/chmod", "+x", installDir + "/ai-service/ai-service");

    component.addElevatedOperation("Execute",
        "/bin/chmod", "+x", installDir + "/ffmpeg/ffmpeg");

    // Run install-ai.sh in a visible terminal so the user can see the
    // ~2.5 GB Ollama + model download progress.
    // Tries x-terminal-emulator (Debian/Ubuntu), then gnome-terminal, xterm as fallback.
    component.addElevatedOperation("Execute",
        "/bin/bash", "-c",
        "if command -v x-terminal-emulator &>/dev/null; then " +
            "x-terminal-emulator -e 'bash \"" + installDir + "/scripts/install-ai.sh\" \"" + installDir + "\"'; " +
        "elif command -v gnome-terminal &>/dev/null; then " +
            "gnome-terminal -- bash \"" + installDir + "/scripts/install-ai.sh\" \"" + installDir + "\"; " +
        "else " +
            "xterm -e 'bash \"" + installDir + "/scripts/install-ai.sh\" \"" + installDir + "\"'; " +
        "fi",
        "UNDOEXECUTE",
        "/bin/bash",
        installDir + "/scripts/uninstall-ollama.sh");
};
