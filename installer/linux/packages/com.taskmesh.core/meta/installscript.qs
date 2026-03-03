/**
 * TaskMesh Core Component — Qt Installer Framework install script
 *
 * QtIFW automatically extracts packages/com.taskmesh.core/data/ into TargetDir.
 * This script handles post-extraction tasks:
 *   1. Run install-services.sh to register systemd units and init the database
 *   2. Create a .desktop entry so TaskMesh appears in app launchers
 *   3. Create a /usr/local/bin/taskmesh symlink for CLI access
 *   4. Register uninstall operations
 */

function Component()
{
    // Constructor — set up any component-level properties here.
}

Component.prototype.createOperations = function()
{
    // Let QtIFW handle the default file extraction from data/
    component.createOperations();

    var installDir = installer.value("TargetDir");
    var dataDir    = "/var/lib/taskmesh";

    // ── 1. Make scripts executable ──────────────────────────────────────────
    component.addElevatedOperation("Execute",
        "/bin/chmod", "-R", "+x", installDir + "/scripts");

    // ── 2. Run install-services.sh ──────────────────────────────────────────
    // Registers systemd units, initialises the SQLite database, starts the server.
    component.addElevatedOperation("Execute",
        "/bin/bash",
        installDir + "/scripts/install-services.sh",
        installDir,
        dataDir,
        "UNDOEXECUTE",
        "/bin/bash",
        installDir + "/scripts/uninstall-services.sh",
        installDir);

    // ── 3. Create .desktop entry ─────────────────────────────────────────────
    // Writes to /usr/share/applications/ so the app appears in GNOME/KDE launchers.
    var desktopEntry =
        "[Desktop Entry]\n" +
        "Name=TaskMesh\n" +
        "Comment=Self-hosted task management\n" +
        "Exec=" + installDir + "/scripts/start-taskmesh.sh\n" +
        "Icon=" + installDir + "/assets/taskmesh.png\n" +
        "Terminal=false\n" +
        "Type=Application\n" +
        "Categories=Office;ProjectManagement;\n" +
        "StartupWMClass=taskmesh\n";

    component.addElevatedOperation("WriteFile",
        "/usr/share/applications/taskmesh.desktop",
        desktopEntry);

    // ── 4. Symlink for CLI ────────────────────────────────────────────────────
    component.addElevatedOperation("CreateLink",
        "/usr/local/bin/taskmesh",
        installDir + "/scripts/start-taskmesh.sh");
};
