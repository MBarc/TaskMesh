; ─────────────────────────────────────────────────────────────────────────────
; TaskMesh Windows Installer
; Built with Inno Setup 6  (https://jrsoftware.org/isinfo.php)
; ─────────────────────────────────────────────────────────────────────────────

#define AppName      "TaskMesh"
#define AppVersion   "1.0.0"
#define AppPublisher "TaskMesh"
#define AppURL       "https://taskmesh.co"
#define AppExeName   "scripts\start-taskmesh.bat"
#define AppGUID      "{{A3F2C1D0-4B7E-4F2A-9C3D-1E5B8F0A2D6C}"

; ─── [Setup] ──────────────────────────────────────────────────────────────────
[Setup]
AppId={#AppGUID}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
AppSupportURL={#AppURL}
AppUpdatesURL={#AppURL}
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
LicenseFile=..\shared\LICENSE.txt
OutputDir=Output
OutputBaseFilename=TaskMesh-Setup
SetupIconFile=assets\taskmesh.ico
WizardImageFile=assets\welcome.bmp
WizardSmallImageFile=assets\banner.bmp
UninstallDisplayIcon={app}\taskmesh.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
WizardSizePercent=120
DisableWelcomePage=no
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.17763
VersionInfoVersion={#AppVersion}
VersionInfoDescription={#AppName} Setup
VersionInfoCompany={#AppPublisher}

; ─── [Languages] ──────────────────────────────────────────────────────────────
[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

; ─── [Tasks] ──────────────────────────────────────────────────────────────────
[Tasks]
Name: "desktopicon";   Description: "Create a &desktop shortcut";          GroupDescription: "Shortcuts:"; Flags: unchecked
Name: "startupentry";  Description: "Start TaskMesh automatically at &login"; GroupDescription: "Startup:";   Flags: unchecked
Name: "autoupdate";    Description: "Check for updates &weekly";            GroupDescription: "Updates:";   Flags: unchecked

; ─── [Files] ──────────────────────────────────────────────────────────────────
[Files]
; App icon — deployed so shortcuts can reference it
Source: "assets\taskmesh.ico";      DestDir: "{app}";                   Flags: ignoreversion

; Node.js runtime
Source: "dist\node\*";              DestDir: "{app}\node";              Flags: ignoreversion recursesubdirs createallsubdirs

; Compiled server (TypeScript → JS)
Source: "dist\server\dist\*";       DestDir: "{app}\server\dist";       Flags: ignoreversion recursesubdirs createallsubdirs
Source: "dist\server\node_modules\*"; DestDir: "{app}\server\node_modules"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "dist\server\prisma\*";     DestDir: "{app}\server\prisma";     Flags: ignoreversion recursesubdirs createallsubdirs

; Built React SPA — placed inside the server directory so Express can find it at
; ../public relative to server/dist/index.js with no path calculation ambiguity.
Source: "dist\server\public\*";     DestDir: "{app}\server\public";     Flags: ignoreversion recursesubdirs createallsubdirs

; NSSM service manager
Source: "dist\nssm\nssm.exe";       DestDir: "{app}\nssm";              Flags: ignoreversion

; Installer scripts
Source: "scripts\install-services.ps1";   DestDir: "{app}\scripts"; Flags: ignoreversion
Source: "scripts\install-ai.ps1";         DestDir: "{app}\scripts"; Flags: ignoreversion; Components: ai
Source: "scripts\uninstall-services.ps1"; DestDir: "{app}\scripts"; Flags: ignoreversion
Source: "scripts\uninstall-ollama.ps1";   DestDir: "{app}\scripts"; Flags: ignoreversion; Components: ai
Source: "scripts\ensure-port.ps1";        DestDir: "{app}\scripts"; Flags: ignoreversion
Source: "scripts\start-taskmesh.bat";     DestDir: "{app}\scripts"; Flags: ignoreversion
Source: "scripts\launch-taskmesh.vbs";    DestDir: "{app}\scripts"; Flags: ignoreversion
Source: "scripts\check-updates.ps1";      DestDir: "{app}\updater"; Flags: ignoreversion; Tasks: autoupdate

; AI component (optional — only extracted when AI component is selected)
Source: "dist\ai-service\*";        DestDir: "{app}\ai-service";        Flags: ignoreversion recursesubdirs createallsubdirs; Components: ai
Source: "dist\ffmpeg\ffmpeg.exe";   DestDir: "{app}\ffmpeg";             Flags: ignoreversion; Components: ai

; Connector SDK (optional)
Source: "..\..\server\src\connectors\framework\*"; DestDir: "{app}\sdk\framework"; Flags: ignoreversion recursesubdirs createallsubdirs; Components: sdk
Source: "..\..\server\src\connectors\manifest.schema.json";  DestDir: "{app}\sdk";           Flags: ignoreversion; Components: sdk
Source: "..\..\server\src\connectors\example-connector\*";   DestDir: "{app}\sdk\example-connector"; Flags: ignoreversion recursesubdirs createallsubdirs; Components: sdk

; ─── [Components] ─────────────────────────────────────────────────────────────
[Components]
Name: "core"; Description: "Core Application (required)"; Types: full compact custom; Flags: fixed
Name: "sdk";  Description: "Connector SDK — build your own connectors"; Types: full
Name: "ai";   Description: "AI Features — task extraction & transcription (~1 GB)"; Types: full

; ─── [Icons] ──────────────────────────────────────────────────────────────────
[Icons]
; Start menu entries (always created)
; Use wscript.exe + VBS so launching never opens a terminal window.
Name: "{group}\{#AppName}";           Filename: "{sys}\wscript.exe"; Parameters: """{app}\scripts\launch-taskmesh.vbs"""; WorkingDir: "{app}"; IconFilename: "{app}\taskmesh.ico"
Name: "{group}\Uninstall {#AppName}"; Filename: "{uninstallexe}"
; Desktop shortcut is created programmatically in CurStepChanged based on OptionsPage

; ─── [Registry] ───────────────────────────────────────────────────────────────
[Registry]
; Application registration — uninsdeletekey removes the entire key on uninstall.
; AppDir is written here AND by install-services.ps1 (same value) so start-taskmesh.bat
; always finds it even if the post-install script encounters an error.
Root: HKLM; Subkey: "Software\{#AppName}"; ValueType: string; ValueName: "Version";    ValueData: "{#AppVersion}"; Flags: createvalueifdoesntexist uninsdeletekey
Root: HKLM; Subkey: "Software\{#AppName}"; ValueType: string; ValueName: "AppDir";     ValueData: "{app}"
Root: HKLM; Subkey: "Software\{#AppName}"; ValueType: string; ValueName: "InstallDir"; ValueData: "{app}"
Root: HKLM; Subkey: "Software\{#AppName}"; ValueType: string; ValueName: "DataDir";    ValueData: "{code:GetDataDir}"
Root: HKLM; Subkey: "Software\{#AppName}"; ValueType: string; ValueName: "Port";       ValueData: "{code:GetPort}"
; Startup entry and desktop shortcut are written programmatically in CurStepChanged

; ─── [Run] ────────────────────────────────────────────────────────────────────
[Run]
; Step 1a — Register core Windows services (default: hidden, no console flash)
Filename: "powershell.exe"; \
    Parameters: "-NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File ""{app}\scripts\install-services.ps1"" -AppDir ""{app}"" -DataDir ""{code:GetDataDir}"""; \
    StatusMsg: "Registering TaskMesh services (this may take a minute)..."; \
    Flags: runhidden waituntilterminated; \
    Check: IsNotVerboseMode

; Step 1b — Register core Windows services (/VERBOSE: visible console window)
Filename: "powershell.exe"; \
    Parameters: "-ExecutionPolicy Bypass -File ""{app}\scripts\install-services.ps1"" -AppDir ""{app}"" -DataDir ""{code:GetDataDir}"" -Verbose"; \
    StatusMsg: "Registering TaskMesh services (verbose — console window is open)..."; \
    Flags: waituntilterminated; \
    Check: IsVerboseMode

; Step 2 — AI components (visible window, slow ~2.5 GB download)
Filename: "powershell.exe"; \
    Parameters: "-ExecutionPolicy Bypass -File ""{app}\scripts\install-ai.ps1"" -AppDir ""{app}"""; \
    StatusMsg: "Downloading AI components (~2.5 GB) — a progress window is open..."; \
    Flags: waituntilterminated; Components: ai

; Open app in browser (optional, shown on finish page)
; Use wscript.exe + VBS so no terminal window appears when the user clicks "Launch".
Filename: "{sys}\wscript.exe"; \
    Parameters: """{app}\scripts\launch-taskmesh.vbs"""; \
    WorkingDir: "{app}"; \
    Description: "Launch {#AppName} now"; \
    Flags: nowait postinstall skipifsilent

; ─── [UninstallRun] ───────────────────────────────────────────────────────────
[UninstallRun]
Filename: "powershell.exe"; \
    Parameters: "-NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File ""{app}\scripts\uninstall-services.ps1"" -AppDir ""{app}"""; \
    Flags: runhidden waituntilterminated; \
    RunOnceId: "StopServices"

; Remove Ollama only if user said yes and TaskMesh was the one that installed it
Filename: "powershell.exe"; \
    Parameters: "-NonInteractive -ExecutionPolicy Bypass -File ""{app}\scripts\uninstall-ollama.ps1"""; \
    StatusMsg: "Removing Ollama..."; \
    Flags: runhidden waituntilterminated; \
    RunOnceId: "RemoveOllama"; \
    Check: ShouldRemoveOllama

; ─── [UninstallDelete] ────────────────────────────────────────────────────────
[UninstallDelete]
Type: files;          Name: "{commondesktop}\{#AppName}.lnk"
Type: filesandordirs; Name: "{app}\logs"
Type: filesandordirs; Name: "{app}\node"
Type: filesandordirs; Name: "{app}\server"
Type: filesandordirs; Name: "{app}\client"
Type: filesandordirs; Name: "{app}\ai-service"
Type: filesandordirs; Name: "{app}\ffmpeg"
Type: filesandordirs; Name: "{app}\nssm"
Type: filesandordirs; Name: "{app}\sdk"
Type: filesandordirs; Name: "{app}\scripts"
Type: filesandordirs; Name: "{app}\updater"
Type: filesandordirs; Name: "{app}"

; ─── [INI] ────────────────────────────────────────────────────────────────────
; desktop.ini tells Windows Explorer to use the TaskMesh logo as the folder icon
; for the install directory.  The file must be system+hidden; the folder must be
; read-only (just the flag — not actual protection).  Both are set in [Run].
[INI]
Filename: "{app}\desktop.ini"; Section: ".ShellClassInfo"; Key: "IconResource"; String: "{app}\taskmesh.ico,0"
Filename: "{app}\desktop.ini"; Section: ".ShellClassInfo"; Key: "IconIndex";    String: "0"

; ─── [Code] ───────────────────────────────────────────────────────────────────
[Code]

// ── Global state ─────────────────────────────────────────────────────────────
var
  DataDirPage:     TInputDirWizardPage;
  OptionsPage:     TInputOptionWizardPage;
  CelebrationPage: TWizardPage;

  // Celebration page widgets
  CelebPanel:      TPanel;
  CelebTitle:      TLabel;
  CelebCheck1:     TLabel;
  CelebCheck2:     TLabel;
  CelebCheck3:     TLabel;
  CelebTagline:    TLabel;

  IsRepairMode:    Boolean;
  RemoveOllama:    Boolean;
  DataDirToRemove: String;

// ── Helper: read registry string ────────────────────────────────────────────
function RegGetStr(RootKey: Integer; SubKey, Name: String): String;
var
  Value: String;
begin
  if not RegQueryStringValue(RootKey, SubKey, Name, Value) then
    Value := '';
  Result := Value;
end;

// ── Helper: data dir (used by [Registry] and [Run] callbacks) ───────────────
// CLI /DATADIR= takes precedence over the wizard page value and the default.
function GetDataDir(Param: String): String;
var
  CliDir: String;
begin
  CliDir := ExpandConstant('{param:DATADIR|}');
  if CliDir <> '' then
    Result := CliDir
  else if DataDirPage <> nil then
    Result := DataDirPage.Values[0]
  else
    Result := ExpandConstant('{userdocs}\TaskMesh');
end;

// ── Helper: chosen port (always 4000 — script auto-detects conflicts) ────────
function GetPort(Param: String): String;
begin
  Result := '4000';
end;

// ── Helper: should AI service be installed ───────────────────────────────────
function GetInstallAI(Param: String): String;
begin
  if IsComponentSelected('ai') then
    Result := '1'
  else
    Result := '0';
end;

// ── Helper: quiet mode — skip wizard pages, read all settings from CLI ────────
// Activated by Inno's /SILENT or /VERYSILENT, or by the custom /QUIET flag.
// Use for scripted/programmatic installs where no user interaction is possible.
function IsQuietMode: Boolean;
begin
  Result := WizardSilent() or (ExpandConstant('{param:QUIET|}') <> '');
end;

// ── Helper: verbose mode — show console output from install-services.ps1 ─────
// Activated by /VERBOSE. Without this, the service install runs completely hidden.
function IsVerboseMode: Boolean;
begin
  Result := ExpandConstant('{param:VERBOSE|}') <> '';
end;

// Used in [Run] Check: — Inno requires a named function, not an inline 'not'
function IsNotVerboseMode: Boolean;
begin
  Result := not IsVerboseMode();
end;

// ── Maintenance dialog — returns 1=Repair, 2=Uninstall, 0=Cancel ────────────
// MsgBox button labels cannot be customised, so we build a small TForm instead.
function ShowMaintenanceDialog: Integer;
var
  Form:                   TForm;
  Lbl:                    TLabel;
  BtnRepair, BtnUninstall, BtnCancel: TButton;
begin
  Result := 0;
  Form := TForm.Create(nil);
  try
    Form.Caption      := 'TaskMesh Already Installed';
    Form.ClientWidth  := 430;
    Form.ClientHeight := 160;
    Form.Position     := poScreenCenter;
    Form.BorderStyle  := bsDialog;
    Form.Font.Name    := 'Segoe UI';
    Form.Font.Size    := 9;

    Lbl := TLabel.Create(Form);
    Lbl.Parent    := Form;
    Lbl.Caption   :=
      'TaskMesh is already installed on this computer.' + #13#10#13#10 +
      'Repair re-installs files and re-registers services.' + #13#10 +
      'Uninstall removes TaskMesh completely.';
    Lbl.Left      := 16;
    Lbl.Top       := 16;
    Lbl.Width     := 398;
    Lbl.Height    := 60;
    Lbl.WordWrap  := True;
    Lbl.AutoSize  := False;

    BtnRepair := TButton.Create(Form);
    BtnRepair.Parent      := Form;
    BtnRepair.Caption     := 'Repair';
    BtnRepair.Left        := 16;
    BtnRepair.Top         := 114;
    BtnRepair.Width       := 120;
    BtnRepair.Height      := 32;
    BtnRepair.ModalResult := mrYes;

    BtnUninstall := TButton.Create(Form);
    BtnUninstall.Parent      := Form;
    BtnUninstall.Caption     := 'Uninstall';
    BtnUninstall.Left        := 152;
    BtnUninstall.Top         := 114;
    BtnUninstall.Width       := 120;
    BtnUninstall.Height      := 32;
    BtnUninstall.ModalResult := mrNo;

    BtnCancel := TButton.Create(Form);
    BtnCancel.Parent      := Form;
    BtnCancel.Caption     := 'Cancel';
    BtnCancel.Left        := 294;
    BtnCancel.Top         := 114;
    BtnCancel.Width       := 120;
    BtnCancel.Height      := 32;
    BtnCancel.ModalResult := mrCancel;
    BtnCancel.Cancel      := True;

    case Form.ShowModal of
      mrYes: Result := 1;
      mrNo:  Result := 2;
    end;
  finally
    Form.Free;
  end;
end;

// ── InitializeSetup ──────────────────────────────────────────────────────────
function InitializeSetup: Boolean;
var
  ExistingVersion: String;
  Choice:          Integer;
  UninstallExe:    String;
  ResultCode:      Integer;
  LogFile:         String;
begin
  IsRepairMode := False;

  // /uninstall command-line switch: silently run the existing uninstaller and exit.
  // Usage: TaskMesh-Setup.exe /uninstall
  if ExpandConstant('{param:uninstall|no}') <> 'no' then begin
    UninstallExe := RegGetStr(HKLM,
      'SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{A3F2C1D0-4B7E-4F2A-9C3D-1E5B8F0A2D6C}_is1',
      'UninstallString');
    if (Length(UninstallExe) >= 2) and
       (UninstallExe[1] = '"') and
       (UninstallExe[Length(UninstallExe)] = '"') then
      UninstallExe := Copy(UninstallExe, 2, Length(UninstallExe) - 2);
    if (UninstallExe <> '') and FileExists(UninstallExe) then
      Exec(UninstallExe, '/VERYSILENT /SUPPRESSMSGBOXES', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Result := False;
    Exit;
  end;

  ExistingVersion := RegGetStr(HKLM, 'Software\TaskMesh', 'Version');

  if ExistingVersion = '' then begin
    // Fresh install — in quiet/silent mode, /DATADIR is required because it
    // determines where user data (database, documents) is permanently stored.
    // Without it, the installer cannot proceed non-interactively.
    if IsQuietMode() and (ExpandConstant('{param:DATADIR|}') = '') then begin
      LogFile := ExpandConstant('{tmp}\taskmesh-setup-error.log');
      SaveStringToFile(LogFile,
        'TaskMesh silent install error: /DATADIR=<path> is required.' + #13#10 + #13#10 +
        'Example:' + #13#10 +
        '  TaskMesh-Setup.exe /QUIET /VERYSILENT' + #13#10 +
        '      /DIR="C:\Program Files\TaskMesh"' + #13#10 +
        '      /DATADIR="C:\ProgramData\TaskMesh"' + #13#10 + #13#10 +
        'All parameters:' + #13#10 +
        '  /DIR=<path>          Install directory (default: ' +
            ExpandConstant('{autopf}\TaskMesh') + ')' + #13#10 +
        '  /DATADIR=<path>      Data directory -- database + documents (REQUIRED)' + #13#10 +
        '  /AUTOUPDATE=1|0      Weekly update checks (default: 0)' + #13#10 +
        '  /STARTUP=1|0         Start on Windows login (default: 0)' + #13#10 +
        '  /DESKTOPICON=1|0     Desktop shortcut (default: 0)' + #13#10 +
        '  /COMPONENTS=<list>   Components: core,sdk,ai (default: core)' + #13#10 +
        '  /VERBOSE             Show service install console output' + #13#10 +
        '  /QUIET               Skip wizard UI (combine with /VERYSILENT)' + #13#10,
        False);
      // Show error dialog when /QUIET (but not /VERYSILENT) is used so the
      // operator running the script sees what went wrong.
      if not WizardSilent() then
        MsgBox(
          'Silent install requires /DATADIR=<path>.' + #13#10 + #13#10 +
          'Example:' + #13#10 +
          '  TaskMesh-Setup.exe /QUIET /VERYSILENT' + #13#10 +
          '      /DIR="C:\Program Files\TaskMesh"' + #13#10 +
          '      /DATADIR="C:\ProgramData\TaskMesh"' + #13#10 + #13#10 +
          'Full parameter reference written to:' + #13#10 +
          '  ' + LogFile,
          mbError, MB_OK);
      Result := False;
      Exit;
    end;
    Result := True;
    Exit;
  end;

  // Existing install — maintenance mode.
  // In quiet/silent mode: automatically proceed with repair (re-install files,
  // re-register services) without requiring a GUI response.
  if IsQuietMode() then begin
    IsRepairMode := True;
    Result := True;
    Exit;
  end;

  Choice := ShowMaintenanceDialog;

  case Choice of
    1: // Repair — proceed with normal install flow
    begin
      IsRepairMode := True;
      Result := True;
    end;

    2: // Uninstall
    begin
      // IMPORTANT: Do NOT use {#AppGUID} inside Pascal string literals.
      // The preprocessor expands AppGUID to "{{A3F2C1D0-..." (double-curly) which
      // is correct in [Setup]/[Registry] sections where {{ → { is un-escaped, but
      // in [Code] Pascal strings {{ stays as two literal { characters, making the
      // registry key lookup fail with an empty result.
      // Hardcode the GUID path directly so the string is exactly right.
      UninstallExe := RegGetStr(HKLM,
        'SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{A3F2C1D0-4B7E-4F2A-9C3D-1E5B8F0A2D6C}_is1',
        'UninstallString');

      // Inno Setup stores the path surrounded by double quotes when it contains
      // spaces (e.g. "C:\Program Files\TaskMesh\unins000.exe"). Strip them before
      // passing to Exec — treating a quoted string as a filename causes failure.
      if (Length(UninstallExe) >= 2) and
         (UninstallExe[1] = '"') and
         (UninstallExe[Length(UninstallExe)] = '"') then
        UninstallExe := Copy(UninstallExe, 2, Length(UninstallExe) - 2);

      if (UninstallExe <> '') and FileExists(UninstallExe) then
        Exec(UninstallExe, '/SILENT', '', SW_SHOW, ewWaitUntilTerminated, ResultCode)
      else
        MsgBox(
          'Uninstaller not found. Use Settings > Apps to remove TaskMesh manually.',
          mbError, MB_OK);

      Result := False; // abort this installer run regardless
    end;

    else // Cancel (0)
      Result := False;
  end;
end;

// ── CreateCustomPages ────────────────────────────────────────────────────────
procedure CreateCustomPages;
var
  DefaultDataDir: String;
begin
  DefaultDataDir := ExpandConstant('{userdocs}\TaskMesh');

  // Page 1 — Data location
  DataDirPage := CreateInputDirPage(
    wpSelectDir,
    'Choose Data Folder',
    'Tell Buzz where to set up shop.',
    'TaskMesh stores your database and documents here. The default location ' +
    'works great for most people — only change it if you need your data ' +
    'somewhere specific (e.g. a different drive).',
    False, ''
  );
  DataDirPage.Add('&Data folder:');
  // CLI /DATADIR= takes precedence over the default path.
  if ExpandConstant('{param:DATADIR|}') <> '' then
    DataDirPage.Values[0] := ExpandConstant('{param:DATADIR|}')
  else
    DataDirPage.Values[0] := DefaultDataDir;

  // Page 2 — Options
  OptionsPage := CreateInputOptionPage(
    DataDirPage.ID,
    'Set Up Your Preferences',
    'A few quick choices before Buzz gets to work.',
    '',
    False, False
  );
  OptionsPage.Add('Check for updates weekly');
  OptionsPage.Add('Start TaskMesh automatically when Windows starts');
  OptionsPage.Add('Create a desktop shortcut');
  // Default values, overridden by /AUTOUPDATE=1|0, /STARTUP=1|0, /DESKTOPICON=1|0.
  if ExpandConstant('{param:AUTOUPDATE|}') <> '' then
    OptionsPage.Values[0] := (ExpandConstant('{param:AUTOUPDATE|}') = '1')
  else
    OptionsPage.Values[0] := False;  // auto-update: off by default (stub, not yet functional)

  if ExpandConstant('{param:STARTUP|}') <> '' then
    OptionsPage.Values[1] := (ExpandConstant('{param:STARTUP|}') = '1')
  else
    OptionsPage.Values[1] := False;

  if ExpandConstant('{param:DESKTOPICON|}') <> '' then
    OptionsPage.Values[2] := (ExpandConstant('{param:DESKTOPICON|}') = '1')
  else
    OptionsPage.Values[2] := True;

  // Page 3 — Celebration (after install)
  CelebrationPage := CreateCustomPage(
    wpInfoAfter,
    'TaskMesh is Ready!',
    'Everything is installed and running.'
  );

  // Build celebration panel
  CelebPanel := TPanel.Create(WizardForm);
  CelebPanel.Parent := CelebrationPage.Surface;
  CelebPanel.Left   := 0;
  CelebPanel.Top    := 0;
  CelebPanel.Width  := CelebrationPage.SurfaceWidth;
  CelebPanel.Height := CelebrationPage.SurfaceHeight;
  // White background — matches the website's light aesthetic so dark text is readable.
  CelebPanel.Color      := $FFFFFF;
  CelebPanel.BevelOuter := bvNone;
  CelebPanel.BevelInner := bvNone;

  CelebTitle := TLabel.Create(WizardForm);
  CelebTitle.Parent     := CelebPanel;
  CelebTitle.Caption    := 'You''re all set.';
  CelebTitle.Font.Name  := 'Segoe UI';
  CelebTitle.Font.Size  := 18;
  CelebTitle.Font.Style := [fsBold];
  CelebTitle.Font.Color := $CA3843;   // brand-700 #4338CA — dark indigo heading
  CelebTitle.AutoSize   := True;
  CelebTitle.Left       := 24;
  CelebTitle.Top        := 20;

  CelebCheck1 := TLabel.Create(WizardForm);
  CelebCheck1.Parent    := CelebPanel;
  CelebCheck1.Caption   := '✓  Server running on http://localhost:4000';
  CelebCheck1.Font.Name := 'Segoe UI';
  CelebCheck1.Font.Size := 11;
  CelebCheck1.Font.Color := $812E31;  // brand-900 #312E81 — deep indigo, readable on white
  CelebCheck1.AutoSize  := True;
  CelebCheck1.Left      := 24;
  CelebCheck1.Top       := 70;

  CelebCheck2 := TLabel.Create(WizardForm);
  CelebCheck2.Parent    := CelebPanel;
  CelebCheck2.Caption   := '✓  Database initialized';
  CelebCheck2.Font.Name := 'Segoe UI';
  CelebCheck2.Font.Size := 11;
  CelebCheck2.Font.Color := $812E31;  // brand-900
  CelebCheck2.AutoSize  := True;
  CelebCheck2.Left      := 24;
  CelebCheck2.Top       := 96;

  CelebCheck3 := TLabel.Create(WizardForm);
  CelebCheck3.Parent    := CelebPanel;
  CelebCheck3.Caption   := '✓  Shortcuts created';
  CelebCheck3.Font.Name := 'Segoe UI';
  CelebCheck3.Font.Size := 11;
  CelebCheck3.Font.Color := $812E31;  // brand-900
  CelebCheck3.AutoSize  := True;
  CelebCheck3.Left      := 24;
  CelebCheck3.Top       := 122;

  CelebTagline := TLabel.Create(WizardForm);
  CelebTagline.Parent    := CelebPanel;
  CelebTagline.Caption   := 'Click "Finish" to open TaskMesh in your browser.';
  CelebTagline.Font.Name := 'Segoe UI';
  CelebTagline.Font.Size := 9;
  CelebTagline.Font.Color := $E5464F;  // brand-600 #4F46E5 — medium indigo tagline
  CelebTagline.AutoSize  := True;
  CelebTagline.Left      := 24;
  CelebTagline.Top       := 165;
end;

// ── InitializeWizard ─────────────────────────────────────────────────────────
procedure InitializeWizard;
begin
  // Apply Segoe UI across the entire wizard (matches website's Inter font)
  WizardForm.Font.Name := 'Segoe UI';
  WizardForm.Font.Size := 9;

  CreateCustomPages;
end;

// ── NextButtonClick ───────────────────────────────────────────────────────────
function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;

  // Sync Tasks checkboxes with OptionsPage values when leaving options page
  if CurPageID = OptionsPage.ID then begin
    if OptionsPage.Values[0] then WizardSelectTasks('autoupdate')   else WizardSelectTasks('!autoupdate');
    if OptionsPage.Values[1] then WizardSelectTasks('startupentry') else WizardSelectTasks('!startupentry');
    if OptionsPage.Values[2] then WizardSelectTasks('desktopicon')  else WizardSelectTasks('!desktopicon');
  end;
end;

// ── PrepareToInstall — warn about AI download size ────────────────────────────
function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Result := '';
  NeedsRestart := False;

  if IsComponentSelected('ai') then begin
    // In quiet mode, AI was selected via /COMPONENTS=ai — user already consented
    // programmatically. Skip the confirmation dialog.
    if IsQuietMode() then
      Exit;
    if MsgBox(
      'AI Features require downloading approximately 2.5 GB of data.' + #13#10 + #13#10 +
      'This includes the Ollama AI engine and a language model. A progress' + #13#10 +
      'window will appear automatically — the download may take 20-40 minutes' + #13#10 +
      'depending on your internet connection.' + #13#10 + #13#10 +
      'Continue with AI Features?',
      mbConfirmation, MB_YESNO) = IDNO then
      Result := 'Installation cancelled. Run setup again and uncheck ' +
                '"AI Features" on the Components page to install without AI.';
  end;
end;

// ── Uninstall: ask about Ollama, then clean up extras ─────────────────────────
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usUninstall then begin
    RemoveOllama := False;
    // Read DataDir before the registry key is deleted later in the uninstall sequence.
    DataDirToRemove := RegGetStr(HKLM, 'Software\TaskMesh', 'DataDir');
    // Only prompt in interactive mode -- skip MsgBox during silent uninstall.
    if (not UninstallSilent()) and
       (RegGetStr(HKLM, 'Software\TaskMesh', 'InstalledOllama') = '1') then begin
      RemoveOllama :=
        MsgBox(
          'TaskMesh installed Ollama (the AI engine) on this machine.' + #13#10 + #13#10 +
          'Would you like to remove Ollama too?' + #13#10 + #13#10 +
          'Choose No if you use Ollama with other applications.',
          mbConfirmation, MB_YESNO) = IDYES;
    end;
  end;

  if CurUninstallStep = usPostUninstall then begin
    // Remove startup entry written by CurStepChanged.
    RegDeleteValue(HKCU,
      'Software\Microsoft\Windows\CurrentVersion\Run',
      '{#AppName}');
    // Remove user data directory (database, documentation folder).
    if (DataDirToRemove <> '') and DirExists(DataDirToRemove) then
      DelTree(DataDirToRemove, True, True, True);
  end;
end;

function ShouldRemoveOllama: Boolean;
begin
  Result := RemoveOllama;
end;

// ── CurStepChanged ────────────────────────────────────────────────────────────
procedure CurStepChanged(CurStep: TSetupStep);
var
  ActualPort:    String;
  ShortcutPath:  String;
  AppIconPath:   String;
  VbsPath:       String;
begin
  if CurStep = ssPostInstall then begin
    // Read the actual port written by install-services.ps1 (may differ from 4000
    // if the script detected a conflict and auto-assigned a free port).
    ActualPort := RegGetStr(HKLM, 'Software\TaskMesh', 'Port');
    if ActualPort = '' then ActualPort := '4000';
    CelebCheck1.Caption := '✓  Server running on http://localhost:' + ActualPort;
    CelebCheck3.Caption := '✓  Shortcuts created';

    // Use the VBS launcher so shortcuts never open a terminal window.
    VbsPath     := ExpandConstant('{app}\scripts\launch-taskmesh.vbs');
    AppIconPath := ExpandConstant('{app}\taskmesh.ico');

    // Desktop shortcut — created directly so it works regardless of wizard page state.
    // WizardSelectTasks() is unreliable when wpSelectTasks is skipped.
    if OptionsPage.Values[2] then begin
      ShortcutPath := ExpandConstant('{commondesktop}\{#AppName}.lnk');
      CreateShellLink(ShortcutPath, 'Launch {#AppName}',
        ExpandConstant('{sys}\wscript.exe'),
        '"' + VbsPath + '"',
        ExpandConstant('{app}'), AppIconPath, 0, SW_SHOWNORMAL);
    end;

    // Startup on login
    if OptionsPage.Values[1] then
      RegWriteStringValue(HKCU,
        'Software\Microsoft\Windows\CurrentVersion\Run',
        '{#AppName}',
        '"' + ExpandConstant('{sys}\wscript.exe') + '" "' + VbsPath + '"');
  end;
end;

// ── ShouldSkipPage ────────────────────────────────────────────────────────────
// 1. Always hide the built-in Select Tasks page — our OptionsPage handles it.
// 2. In quiet mode, skip every wizard page — all values come from CLI params.
function ShouldSkipPage(PageID: Integer): Boolean;
begin
  if PageID = wpSelectTasks then begin
    Result := True;
    Exit;
  end;
  Result := IsQuietMode();
end;
