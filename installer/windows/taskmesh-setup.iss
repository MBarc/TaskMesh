; ─────────────────────────────────────────────────────────────────────────────
; TaskMesh Windows Installer
; Built with Inno Setup 6  (https://jrsoftware.org/isinfo.php)
; ─────────────────────────────────────────────────────────────────────────────

#define AppName      "TaskMesh"
#define AppVersion   "0.0.20"
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
DisableFinishedPage=yes
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
Name: "autoupdate";    Description: "Check for updates &weekly";            GroupDescription: "Updates:"

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
Source: "dist\server\package.json"; DestDir: "{app}\server";             Flags: ignoreversion

; Built React SPA — placed inside the server directory so Express can find it at
; ../public relative to server/dist/index.js with no path calculation ambiguity.
Source: "dist\server\public\*";     DestDir: "{app}\server\public";     Flags: ignoreversion recursesubdirs createallsubdirs

; NSSM service manager
Source: "dist\nssm\nssm.exe";       DestDir: "{app}\nssm";              Flags: ignoreversion

; Installer scripts
Source: "scripts\install-services.ps1";          DestDir: "{app}\scripts"; Flags: ignoreversion
Source: "scripts\ps-launcher.exe";               DestDir: "{app}\scripts"; Flags: ignoreversion
Source: "scripts\install-ai.ps1";         DestDir: "{app}\scripts"; Flags: ignoreversion; Components: ai
Source: "scripts\detect-hardware.ps1";    DestDir: "{app}\scripts"; Flags: ignoreversion; Components: ai
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
Root: HKLM; Subkey: "Software\{#AppName}"; ValueType: string; ValueName: "Version";    ValueData: "{#AppVersion}"; Flags: uninsdeletekey
Root: HKLM; Subkey: "Software\{#AppName}"; ValueType: string; ValueName: "AppDir";     ValueData: "{app}"
Root: HKLM; Subkey: "Software\{#AppName}"; ValueType: string; ValueName: "InstallDir"; ValueData: "{app}"
Root: HKLM; Subkey: "Software\{#AppName}"; ValueType: string; ValueName: "DataDir";    ValueData: "{code:GetDataDir}"
Root: HKLM; Subkey: "Software\{#AppName}"; ValueType: string; ValueName: "Port";       ValueData: "{code:GetPort}"
; Startup entry and desktop shortcut are written programmatically in CurStepChanged

; ─── [Run] ────────────────────────────────────────────────────────────────────
[Run]
; Step 1a — Register core Windows services (default: hidden, no console flash)
; ps-launcher.exe is a GUI-subsystem WinExe compiled at build time.  Because it
; is not a console app, Windows never creates a console window for it.  It uses
; ProcessStartInfo.CreateNoWindow=true so the child PowerShell is also fully
; hidden — eliminating the brief flash that occurs with -WindowStyle Hidden alone.
Filename: "{app}\scripts\ps-launcher.exe"; \
    Parameters: """{app}\scripts\install-services.ps1"" -AppDir ""{app}"" -DataDir ""{code:GetDataDir}"" -TelemetryEnabled ""{code:GetTelemetryEnabled}"" -AppVersion ""{#AppVersion}"""; \
    StatusMsg: "Registering TaskMesh services (this may take a minute)..."; \
    Flags: waituntilterminated; \
    Check: IsNotVerboseMode

; Step 1b — Register core Windows services (/VERBOSE: visible console window)
Filename: "powershell.exe"; \
    Parameters: "-ExecutionPolicy Bypass -File ""{app}\scripts\install-services.ps1"" -AppDir ""{app}"" -DataDir ""{code:GetDataDir}"" -TelemetryEnabled ""{code:GetTelemetryEnabled}"" -AppVersion ""{#AppVersion}"" -Verbose"; \
    StatusMsg: "Registering TaskMesh services (verbose — console window is open)..."; \
    Flags: waituntilterminated; \
    Check: IsVerboseMode

; Step 2 — AI components (runs hidden via ps-launcher.exe — no console flash)
Filename: "{app}\scripts\ps-launcher.exe"; \
    Parameters: """{app}\scripts\install-ai.ps1"" -AppDir ""{app}"" -OllamaModel ""{code:GetAIModel}"""; \
    StatusMsg: "Setting up AI components (this may take a while)..."; \
    Flags: waituntilterminated; Components: ai; \
    Check: IsAIEnabled

; Launch is handled by DeinitializeSetup via the checkbox on CelebrationPage.

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
; NOTE: {app} itself is NOT listed here — unins000.exe is still running inside
; it at this point, so DelTree would fail.  The directory is removed by a
; detached PowerShell command in CurUninstallStepChanged (usPostUninstall)
; which fires after the uninstaller has fully exited.

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
  TelemetryPage:   TInputOptionWizardPage;
  AIModelPage:     TWizardPage;
  CelebrationPage: TWizardPage;

  DetectedModel:   String;  // hardware-selected model or 'disabled'
  AIModelIndex:    Integer; // index of the currently selected AI model (0–3)

  // AI model page radio buttons (stored globally so GetAIModel can read Checked)
  AIRadio0, AIRadio1, AIRadio2, AIRadio3: TRadioButton;

  // Celebration page widgets
  CelebPanel:        TPanel;
  CelebTitle:        TLabel;
  CelebLaunchCheck:  TCheckBox;

  InstallCompleted:  Boolean;

  IsRepairMode:    Boolean;
  IsUpdateMode:    Boolean;
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

// ── Helper: compare semver strings ──────────────────────────────────────────
// Returns -1 if V1 < V2, 0 if equal, 1 if V1 > V2.
// Handles up to 4 dot-separated numeric components (e.g. "1.2.3.4").
function CompareVersions(V1, V2: String): Integer;
var
  I, N1, N2: Integer;
  Parts1, Parts2: TStringList;
begin
  Result := 0;
  Parts1 := TStringList.Create;
  Parts2 := TStringList.Create;
  try
    Parts1.Delimiter     := '.';
    Parts1.StrictDelimiter := True;
    Parts1.DelimitedText := V1;

    Parts2.Delimiter     := '.';
    Parts2.StrictDelimiter := True;
    Parts2.DelimitedText := V2;

    // Pad the shorter list with '0' entries
    while Parts1.Count < Parts2.Count do Parts1.Add('0');
    while Parts2.Count < Parts1.Count do Parts2.Add('0');

    for I := 0 to Parts1.Count - 1 do
    begin
      N1 := StrToIntDef(Parts1[I], 0);
      N2 := StrToIntDef(Parts2[I], 0);
      if N1 < N2 then begin Result := -1; Exit; end;
      if N1 > N2 then begin Result :=  1; Exit; end;
    end;
  finally
    Parts1.Free;
    Parts2.Free;
  end;
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

// ── Helper: telemetry opt-in value ('1' = enabled, '0' = disabled) ───────────
// CLI /TELEMETRY= takes precedence; wizard page is read otherwise; default is '1'.
function GetTelemetryEnabled(Param: String): String;
begin
  if ExpandConstant('{param:TELEMETRY|}') <> '' then
  begin
    Result := ExpandConstant('{param:TELEMETRY|}');
    Exit;
  end;
  if (TelemetryPage <> nil) and TelemetryPage.Values[0] then
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

// ── Hardware detection — WMI-based RAM and VRAM queries ──────────────────────
// Returns total physical RAM in GB (0 on failure).
function GetRAMGB: Integer;
var
  Locator, Service, Items, Item: Variant;
  RawStr: String;
begin
  Result := 0;
  try
    Locator := CreateOleObject('WbemScripting.SWbemLocator');
    Service := Locator.ConnectServer('.', 'root\cimv2');
    Items   := Service.ExecQuery('SELECT TotalPhysicalMemory FROM Win32_ComputerSystem');
    if Items.Count > 0 then
    begin
      Item   := Items.ItemIndex(0);
      RawStr := Item.TotalPhysicalMemory;
      if RawStr <> '' then
        Result := StrToInt64(RawStr) div 1073741824;
    end;
  except
  end;
end;

// Returns the largest GPU adapter RAM in GB across all video controllers (0 on failure).
// Note: Win32_VideoController.AdapterRAM is a UINT32, so values above 4 GB are
// reported as 4 GB. This is acceptable for the recommendation UI; the actual
// detect-hardware.ps1 script uses nvidia-smi for accurate VRAM on high-end cards.
function GetVRAMGB: Integer;
var
  Locator, Service, Items, Item: Variant;
  MaxVRAM, CurVRAM: Int64;
  i: Integer;
begin
  Result  := 0;
  MaxVRAM := 0;
  try
    Locator := CreateOleObject('WbemScripting.SWbemLocator');
    Service := Locator.ConnectServer('.', 'root\cimv2');
    Items   := Service.ExecQuery('SELECT AdapterRAM FROM Win32_VideoController');
    for i := 0 to Items.Count - 1 do
    begin
      Item    := Items.ItemIndex(i);
      CurVRAM := Item.AdapterRAM;
      if CurVRAM > MaxVRAM then MaxVRAM := CurVRAM;
    end;
    Result := MaxVRAM div 1073741824;
  except
  end;
end;

// Runs hardware detection and sets the DetectedModel global.
// Mirrors the tier logic in detect-hardware.ps1.
// Falls back to 'llama3.1:8b' if RAM detection returns 0 (WMI failure).
procedure RunHardwareDetection;
var
  RAMGB, VRAMGB: Integer;
begin
  DetectedModel := 'llama3.1:8b';  // safe default if detection fails
  RAMGB  := GetRAMGB;
  VRAMGB := GetVRAMGB;

  if RAMGB = 0 then Exit;  // WMI failure — keep safe default

  if      VRAMGB >= 16 then DetectedModel := 'qwen2.5:32b'
  else if VRAMGB >= 8  then DetectedModel := 'qwen2.5:14b'
  else if VRAMGB >= 4  then DetectedModel := 'llama3.1:8b'
  else if RAMGB  >= 32 then DetectedModel := 'qwen2.5:14b'
  else if RAMGB  >= 16 then DetectedModel := 'llama3.1:8b'
  else if RAMGB  >= 8  then DetectedModel := 'llama3.2:3b'
  else                       DetectedModel := 'disabled';
end;

// ── AI model helpers ─────────────────────────────────────────────────────────
// Maps a model tag to its radio-button index (0–3).
// Unknown/disabled hardware falls back to index 3 (lightest model).
function ModelToIndex(Model: String): Integer;
begin
  if      Model = 'qwen2.5:32b' then Result := 0
  else if Model = 'qwen2.5:14b' then Result := 1
  else if Model = 'llama3.1:8b' then Result := 2
  else                                Result := 3;  // llama3.2:3b or unknown → lightest
end;

// Maps a radio-button index back to its model tag.
function IndexToModel(Idx: Integer): String;
begin
  case Idx of
    0: Result := 'qwen2.5:32b';
    1: Result := 'qwen2.5:14b';
    2: Result := 'llama3.1:8b';
    3: Result := 'llama3.2:3b';
  else
    Result := DetectedModel;
  end;
end;

// Returns the user-chosen model tag.
// Precedence: /OLLAMAMODEL= CLI param → wizard page → hardware detection fallback.
// Called by [Run] Parameters and [Code] PrepareToInstall.
function GetAIModel(Param: String): String;
var
  CliModel: String;
begin
  CliModel := ExpandConstant('{param:OLLAMAMODEL|}');
  if CliModel <> '' then
  begin
    Result := CliModel;
    Exit;
  end;

  if AIModelPage <> nil then
  begin
    Result := IndexToModel(AIModelIndex);
    Exit;
  end;

  // Fallback: use hardware-detected model
  if DetectedModel <> '' then
    Result := DetectedModel
  else
    Result := 'llama3.1:8b';
end;

// Used in [Run] Check: — only run install-ai.ps1 when the AI component is selected.
function IsAIEnabled: Boolean;
begin
  Result := IsComponentSelected('ai');
end;


// ── Maintenance dialog — returns 1=Update/Repair, 2=Uninstall, 0=Cancel ─────
// MsgBox button labels cannot be customised, so we build a small TForm instead.
// IsUpdate=True → shows "Update" button + version banner instead of "Repair".
function ShowMaintenanceDialog(IsUpdate: Boolean; ExistingVer, NewVer: String): Integer;
var
  Form:                   TForm;
  Lbl:                    TLabel;
  BtnAction, BtnUninstall, BtnCancel: TButton;
begin
  Result := 0;
  Form := TForm.Create(nil);
  try
    if IsUpdate then
      Form.Caption := 'Update TaskMesh'
    else
      Form.Caption := 'TaskMesh Already Installed';

    Form.ClientWidth  := 430;
    Form.ClientHeight := 160;
    Form.Position     := poScreenCenter;
    Form.BorderStyle  := bsDialog;
    Form.Font.Name    := 'Segoe UI';
    Form.Font.Size    := 9;

    Lbl := TLabel.Create(Form);
    Lbl.Parent    := Form;
    if IsUpdate then
      Lbl.Caption :=
        'A newer version of TaskMesh is available.' + #13#10 +
        'Installed: ' + ExistingVer + '    New: ' + NewVer + #13#10#13#10 +
        'Update installs the new version and restarts services.' + #13#10 +
        'Uninstall removes TaskMesh completely.'
    else
      Lbl.Caption :=
        'TaskMesh is already installed on this computer.' + #13#10#13#10 +
        'Repair re-installs files and re-registers services.' + #13#10 +
        'Uninstall removes TaskMesh completely.';
    Lbl.Left      := 16;
    Lbl.Top       := 16;
    Lbl.Width     := 398;
    Lbl.Height    := 72;
    Lbl.WordWrap  := True;
    Lbl.AutoSize  := False;

    BtnAction := TButton.Create(Form);
    BtnAction.Parent      := Form;
    if IsUpdate then
      BtnAction.Caption := 'Update'
    else
      BtnAction.Caption := 'Repair';
    BtnAction.Left        := 16;
    BtnAction.Top         := 114;
    BtnAction.Width       := 120;
    BtnAction.Height      := 32;
    BtnAction.ModalResult := mrYes;
    BtnAction.Default     := True;

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
  IsUpdateMode := (ExistingVersion <> '') and
                  (CompareVersions('{#AppVersion}', ExistingVersion) > 0);

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
        '  /TELEMETRY=1|0       Share anonymous usage data (default: 1)' + #13#10 +
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
          '      /DATADIR="C:\ProgramData\TaskMesh"' + #13#10 +
          '      /TELEMETRY=0' + #13#10 + #13#10 +
          'Full parameter reference written to:' + #13#10 +
          '  ' + LogFile,
          mbError, MB_OK);
      Result := False;
      Exit;
    end;
    Result := True;
    Exit;
  end;

  // Existing install — maintenance mode (update or repair).
  // In quiet/silent mode: automatically proceed with update/repair (re-install
  // files, re-register services) without requiring a GUI response.
  if IsQuietMode() then begin
    IsRepairMode := True;
    Result := True;
    Exit;
  end;

  Choice := ShowMaintenanceDialog(IsUpdateMode, ExistingVersion, '{#AppVersion}');

  case Choice of
    1: // Update / Repair — proceed with normal install flow
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
// ── AI model radio-button click handlers ─────────────────────────────────────
procedure AIRadio0Click(Sender: TObject); begin AIModelIndex := 0; end;
procedure AIRadio1Click(Sender: TObject); begin AIModelIndex := 1; end;
procedure AIRadio2Click(Sender: TObject); begin AIModelIndex := 2; end;
procedure AIRadio3Click(Sender: TObject); begin AIModelIndex := 3; end;

// ── CelebLaunchCheckClick ─────────────────────────────────────────────────────
// Keeps the Finish button label in sync with the launch checkbox:
//   checked   → "Launch TaskMesh"  (button opens the app then closes)
//   unchecked → "Close"            (button just closes the installer)
procedure CelebLaunchCheckClick(Sender: TObject);
begin
  if CelebLaunchCheck.Checked then
    WizardForm.NextButton.Caption := 'Launch TaskMesh'
  else
    WizardForm.NextButton.Caption := 'Close';
end;

// ── CreateCustomPages ────────────────────────────────────────────────────────
procedure CreateCustomPages;
var
  DefaultDataDir: String;
  DescLabel:      TLabel;
  RecBadge:       TLabel;
  SpecLabel:      TLabel;
  RowY:           Integer;
begin
  DefaultDataDir := ExpandConstant('{userdocs}\TaskMesh');

  // Page 1 — Data location
  DataDirPage := CreateInputDirPage(
    wpSelectDir,
    'Choose a Data Folder',
    'Your database and documents will be stored here.',
    'The default location works for most people. Change it only if you need ' +
    'your data on a specific drive or in a shared folder. ' +
    'This folder is not deleted when you uninstall TaskMesh.',
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
    'Additional Options',
    'All of these can be changed later from Settings.',
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
    OptionsPage.Values[0] := True;   // auto-update: on by default

  if ExpandConstant('{param:STARTUP|}') <> '' then
    OptionsPage.Values[1] := (ExpandConstant('{param:STARTUP|}') = '1')
  else
    OptionsPage.Values[1] := False;

  if ExpandConstant('{param:DESKTOPICON|}') <> '' then
    OptionsPage.Values[2] := (ExpandConstant('{param:DESKTOPICON|}') = '1')
  else
    OptionsPage.Values[2] := True;

  // Page 3 — Telemetry opt-in
  // Checked by default.  User can uncheck here or toggle later in Settings > Privacy.
  // CLI /TELEMETRY=0 disables it in quiet mode (default 1 = on).
  TelemetryPage := CreateInputOptionPage(
    OptionsPage.ID,
    'Help Improve TaskMesh',
    'Help make TaskMesh better. No personal data, ever.',
    'We collect anonymous signals like "board created" and "feature used" to ' +
    'understand how TaskMesh is used in the real world.' + #13#10#13#10 +
    'No task content, board names, passwords, or personal data is ever sent. ' +
    'You can disable this now by unchecking the box below, or change it at any time in Settings > Privacy.',
    False, False
  );
  TelemetryPage.Add('Share anonymous usage data to help improve TaskMesh');
  // Default on; /TELEMETRY=0 explicitly opts out in quiet/silent mode.
  if ExpandConstant('{param:TELEMETRY|}') = '0' then
    TelemetryPage.Values[0] := False
  else
    TelemetryPage.Values[0] := True;

  // Page 4 — AI model selection (shown only when AI component is selected)
  // Custom TWizardPage with TRadioButton + TLabel pairs for a two-line-per-option
  // layout: bold model name on line 1, muted spec text on line 2.
  // ShouldSkipPage hides this page when the AI component is not selected.
  AIModelIndex := ModelToIndex(DetectedModel);

  AIModelPage := CreateCustomPage(
    wpSelectTasks,
    'AI Model',
    'We made the following recommendation based on your hardware — feel free to change it.'
  );

  // Description label — brief explanation of what the parameter count means
  DescLabel             := TLabel.Create(WizardForm);
  DescLabel.Parent      := AIModelPage.Surface;
  DescLabel.Left        := 0;
  DescLabel.Top         := 0;
  DescLabel.Width       := AIModelPage.SurfaceWidth;
  DescLabel.AutoSize    := False;
  DescLabel.Height      := 18;
  DescLabel.Font.Name   := 'Segoe UI';
  DescLabel.Font.Size   := 9;
  DescLabel.WordWrap    := False;
  if DetectedModel = 'disabled' then
    DescLabel.Caption :=
      'Less than 8 GB of RAM detected — the lightest model is pre-selected.'
  else
    DescLabel.Caption :=
      'More parameters = better AI results, but a larger download and more RAM required.';

  // ── Row builder — 4 option rows, each: radio (name) + rec badge + spec label ──
  // Row height: 20px radio + 18px spec + 10px gap = 48px per row, starting at Y=28.

  // Row 0 — qwen2.5:32b
  RowY := 28;
  AIRadio0             := TRadioButton.Create(WizardForm);
  AIRadio0.Parent      := AIModelPage.Surface;
  AIRadio0.Left        := 0;
  AIRadio0.Top         := RowY;
  AIRadio0.Width       := 140;
  AIRadio0.Height      := 20;
  AIRadio0.Caption     := 'qwen2.5:32b';
  AIRadio0.Font.Name   := 'Segoe UI';
  AIRadio0.Font.Size   := 10;
  AIRadio0.Font.Style  := [fsBold];
  AIRadio0.OnClick     := @AIRadio0Click;
  if AIModelIndex = 0 then begin
    RecBadge           := TLabel.Create(WizardForm);
    RecBadge.Parent    := AIModelPage.Surface;
    RecBadge.Left      := 144;
    RecBadge.Top       := RowY + 3;
    RecBadge.AutoSize  := True;
    RecBadge.Caption   := 'recommended';
    RecBadge.Font.Name := 'Segoe UI';
    RecBadge.Font.Size := 9;
    RecBadge.Font.Color := $E5464F;  // brand-600 #4F46E5
  end;
  SpecLabel             := TLabel.Create(WizardForm);
  SpecLabel.Parent      := AIModelPage.Surface;
  SpecLabel.Left        := 20;
  SpecLabel.Top         := RowY + 21;
  SpecLabel.AutoSize    := True;
  SpecLabel.Caption     := '32 billion parameters  ·  Requires 16 GB+ GPU VRAM  ·  ~20 GB download';
  SpecLabel.Font.Name   := 'Segoe UI';
  SpecLabel.Font.Size   := 9;
  SpecLabel.Font.Color  := $888888;

  // Row 1 — qwen2.5:14b
  RowY := RowY + 48;
  AIRadio1             := TRadioButton.Create(WizardForm);
  AIRadio1.Parent      := AIModelPage.Surface;
  AIRadio1.Left        := 0;
  AIRadio1.Top         := RowY;
  AIRadio1.Width       := 140;
  AIRadio1.Height      := 20;
  AIRadio1.Caption     := 'qwen2.5:14b';
  AIRadio1.Font.Name   := 'Segoe UI';
  AIRadio1.Font.Size   := 10;
  AIRadio1.Font.Style  := [fsBold];
  AIRadio1.OnClick     := @AIRadio1Click;
  if AIModelIndex = 1 then begin
    RecBadge           := TLabel.Create(WizardForm);
    RecBadge.Parent    := AIModelPage.Surface;
    RecBadge.Left      := 144;
    RecBadge.Top       := RowY + 3;
    RecBadge.AutoSize  := True;
    RecBadge.Caption   := 'recommended';
    RecBadge.Font.Name := 'Segoe UI';
    RecBadge.Font.Size := 9;
    RecBadge.Font.Color := $E5464F;
  end;
  SpecLabel             := TLabel.Create(WizardForm);
  SpecLabel.Parent      := AIModelPage.Surface;
  SpecLabel.Left        := 20;
  SpecLabel.Top         := RowY + 21;
  SpecLabel.AutoSize    := True;
  SpecLabel.Caption     := '14 billion parameters  ·  Requires 32 GB+ RAM or 8 GB+ GPU VRAM  ·  ~9 GB download';
  SpecLabel.Font.Name   := 'Segoe UI';
  SpecLabel.Font.Size   := 9;
  SpecLabel.Font.Color  := $888888;

  // Row 2 — llama3.1:8b
  RowY := RowY + 48;
  AIRadio2             := TRadioButton.Create(WizardForm);
  AIRadio2.Parent      := AIModelPage.Surface;
  AIRadio2.Left        := 0;
  AIRadio2.Top         := RowY;
  AIRadio2.Width       := 140;
  AIRadio2.Height      := 20;
  AIRadio2.Caption     := 'llama3.1:8b';
  AIRadio2.Font.Name   := 'Segoe UI';
  AIRadio2.Font.Size   := 10;
  AIRadio2.Font.Style  := [fsBold];
  AIRadio2.OnClick     := @AIRadio2Click;
  if AIModelIndex = 2 then begin
    RecBadge           := TLabel.Create(WizardForm);
    RecBadge.Parent    := AIModelPage.Surface;
    RecBadge.Left      := 144;
    RecBadge.Top       := RowY + 3;
    RecBadge.AutoSize  := True;
    RecBadge.Caption   := 'recommended';
    RecBadge.Font.Name := 'Segoe UI';
    RecBadge.Font.Size := 9;
    RecBadge.Font.Color := $E5464F;
  end;
  SpecLabel             := TLabel.Create(WizardForm);
  SpecLabel.Parent      := AIModelPage.Surface;
  SpecLabel.Left        := 20;
  SpecLabel.Top         := RowY + 21;
  SpecLabel.AutoSize    := True;
  SpecLabel.Caption     := '8 billion parameters  ·  Requires 16 GB+ RAM or 4 GB+ GPU VRAM  ·  ~5 GB download';
  SpecLabel.Font.Name   := 'Segoe UI';
  SpecLabel.Font.Size   := 9;
  SpecLabel.Font.Color  := $888888;

  // Row 3 — llama3.2:3b
  RowY := RowY + 48;
  AIRadio3             := TRadioButton.Create(WizardForm);
  AIRadio3.Parent      := AIModelPage.Surface;
  AIRadio3.Left        := 0;
  AIRadio3.Top         := RowY;
  AIRadio3.Width       := 140;
  AIRadio3.Height      := 20;
  AIRadio3.Caption     := 'llama3.2:3b';
  AIRadio3.Font.Name   := 'Segoe UI';
  AIRadio3.Font.Size   := 10;
  AIRadio3.Font.Style  := [fsBold];
  AIRadio3.OnClick     := @AIRadio3Click;
  if AIModelIndex = 3 then begin
    RecBadge           := TLabel.Create(WizardForm);
    RecBadge.Parent    := AIModelPage.Surface;
    RecBadge.Left      := 144;
    RecBadge.Top       := RowY + 3;
    RecBadge.AutoSize  := True;
    RecBadge.Caption   := 'recommended';
    RecBadge.Font.Name := 'Segoe UI';
    RecBadge.Font.Size := 9;
    RecBadge.Font.Color := $E5464F;
  end;
  SpecLabel             := TLabel.Create(WizardForm);
  SpecLabel.Parent      := AIModelPage.Surface;
  SpecLabel.Left        := 20;
  SpecLabel.Top         := RowY + 21;
  SpecLabel.AutoSize    := True;
  SpecLabel.Caption     := '3 billion parameters  ·  Requires 8 GB+ RAM  ·  ~2 GB download';
  SpecLabel.Font.Name   := 'Segoe UI';
  SpecLabel.Font.Size   := 9;
  SpecLabel.Font.Color  := $888888;

  // Pre-select the hardware-detected model
  case AIModelIndex of
    0: AIRadio0.Checked := True;
    1: AIRadio1.Checked := True;
    2: AIRadio2.Checked := True;
    3: AIRadio3.Checked := True;
  end;

  // Page 4 — Celebration (after install)
  CelebrationPage := CreateCustomPage(
    wpInfoAfter,
    'You''re all set!',
    'TaskMesh is installed and ready to use.'
  );

  // Panel covering the entire surface.
  // Note: Windows visual styles prevent TPanel.Color from painting a custom dark
  // background on Win10/11, so we use a white panel and dark brand text colours
  // for reliable rendering. The page header above carries the brand indigo via
  // the banner BMP.
  CelebPanel := TPanel.Create(WizardForm);
  CelebPanel.Parent := CelebrationPage.Surface;
  CelebPanel.Left   := 0;
  CelebPanel.Top    := 0;
  CelebPanel.Width  := CelebrationPage.SurfaceWidth;
  CelebPanel.Height := CelebrationPage.SurfaceHeight;
  CelebPanel.Color      := $FFFFFF;
  CelebPanel.BevelOuter := bvNone;
  CelebPanel.BevelInner := bvNone;

  // Main heading — brand-600 #4F46E5, large and bold (website primary button/hero colour)
  CelebTitle := TLabel.Create(WizardForm);
  CelebTitle.Parent     := CelebPanel;
  CelebTitle.Caption    := 'You''re all set  ✓';
  CelebTitle.Font.Name  := 'Segoe UI';
  CelebTitle.Font.Size  := 20;
  CelebTitle.Font.Style := [fsBold];
  CelebTitle.Font.Color := $E5464F;   // brand-600 #4F46E5 — website primary
  CelebTitle.AutoSize   := True;
  CelebTitle.Left       := 24;
  CelebTitle.Top        := 16;

  // Launch checkbox — near-black body text matches website body copy; OnClick syncs button
  CelebLaunchCheck := TCheckBox.Create(WizardForm);
  CelebLaunchCheck.Parent    := CelebPanel;
  CelebLaunchCheck.Caption   := 'Open TaskMesh in my browser';
  CelebLaunchCheck.Checked   := True;
  CelebLaunchCheck.Font.Name := 'Segoe UI';
  CelebLaunchCheck.Font.Size := 10;
  CelebLaunchCheck.Font.Color := $271811;   // near-black #111827 — website body text
  CelebLaunchCheck.Width     := 280;
  CelebLaunchCheck.Left      := 22;
  CelebLaunchCheck.Top       := 68;
  CelebLaunchCheck.OnClick   := @CelebLaunchCheckClick;
end;

// ── InitializeWizard ─────────────────────────────────────────────────────────
procedure InitializeWizard;
begin
  // Apply Segoe UI across the entire wizard (matches website's Inter font)
  WizardForm.Font.Name := 'Segoe UI';
  WizardForm.Font.Size := 9;

  // Detect hardware before building pages so AIModelPage can pre-select the
  // recommended model tier. Uses WMI — safe to call this early in the wizard.
  RunHardwareDetection;

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

// ── PrepareToInstall ──────────────────────────────────────────────────────────
function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Result := '';
  NeedsRestart := False;
end;

// ── Uninstall: ask about Ollama, then clean up extras ─────────────────────────
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  TelEnabled: String;
  InstallID:  String;
  PsArgs:     String;
  ResultCode: Integer;
begin
  if CurUninstallStep = usUninstall then begin
    RemoveOllama := False;
    // Read DataDir before the registry key is deleted later in the uninstall sequence.
    DataDirToRemove := RegGetStr(HKLM, 'Software\TaskMesh', 'DataDir');

    // Fire uninstall telemetry before the registry key is removed.
    TelEnabled := RegGetStr(HKLM, 'Software\TaskMesh', 'TelemetryEnabled');
    InstallID  := RegGetStr(HKLM, 'Software\TaskMesh', 'InstallID');
    if (TelEnabled = '1') and (InstallID <> '') then begin
      PsArgs :=
        '-NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -Command ' +
        '"try { Invoke-RestMethod' +
        ' -Uri ''https://us.i.posthog.com/capture/''' +
        ' -Method Post -ContentType ''application/json'' -TimeoutSec 5' +
        ' -Body ''{' +
          '"api_key":"phc_9lzpeA1FHtJ5eDcenDnZgNb9LarR3NCGCXC26PhzM2v",' +
          '"event":"app_uninstalled",' +
          '"distinct_id":"' + InstallID + '",' +
          '"properties":{}' +
        '}''' +
        ' } catch {}"';
      Exec('powershell.exe', PsArgs, '', SW_HIDE, ewNoWait, ResultCode);
    end;

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
    // Remove the install directory itself.  We cannot do this via [UninstallDelete]
    // because unins000.exe is still running inside {app} at that point — Windows
    // refuses to delete a directory containing a running executable.
    // Instead, launch a detached PowerShell that waits 3 seconds (enough for the
    // uninstaller to exit) then force-removes the directory tree.
    Exec('powershell.exe',
      '-NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -Command ' +
      '"Start-Sleep -Seconds 3; ' +
      'Remove-Item -LiteralPath ''' + ExpandConstant('{app}') + ''' ' +
      '-Recurse -Force -ErrorAction SilentlyContinue"',
      '', SW_HIDE, ewNoWait, ResultCode);
  end;
end;

function ShouldRemoveOllama: Boolean;
begin
  Result := RemoveOllama;
end;

// ── CurStepChanged ────────────────────────────────────────────────────────────
procedure CurStepChanged(CurStep: TSetupStep);
var
  ShortcutPath:  String;
  AppIconPath:   String;
  VbsPath:       String;
  NssmExe:       String;
  ResultCode:    Integer;
begin
  // Stop the running service BEFORE files are overwritten (update scenario).
  // install-services.ps1 also stops it, but that runs after [Files] — stopping
  // here ensures node.exe isn't holding file handles during the copy phase.
  if CurStep = ssPreInstall then begin
    NssmExe := ExpandConstant('{app}\nssm\nssm.exe');
    if FileExists(NssmExe) then begin
      Exec(NssmExe, 'stop TaskMesh-Server confirm', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
      Sleep(2000);
    end;
  end;

  if CurStep = ssPostInstall then begin
    InstallCompleted := True;

    // Read the actual port written by install-services.ps1 (may differ from 4000
    // if the script detected a conflict and auto-assigned a free port).
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

    // Store telemetry preference and a unique InstallID in the registry so the
    // uninstaller can fire a PostHog event even after the app is removed.
    RegWriteStringValue(HKLM, 'Software\{#AppName}', 'TelemetryEnabled', GetTelemetryEnabled(''));
    Exec('powershell.exe',
      '-NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -Command ' +
      '"$id = [System.Guid]::NewGuid().ToString(); ' +
      'Set-ItemProperty -Path ''HKLM:\Software\{#AppName}'' -Name InstallID -Value $id -Force"',
      '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  end;
end;

// ── CurPageChanged ────────────────────────────────────────────────────────────
// Rename the Next/Finish button to "Launch TaskMesh" on the celebration page so
// the primary CTA is clear to non-technical users.
procedure CurPageChanged(CurPageID: Integer);
var
  ExtraWidth: Integer;
begin
  if (CelebrationPage <> nil) and (CurPageID = CelebrationPage.ID) then begin
    // Widen the button so "Launch TaskMesh" isn't clipped
    ExtraWidth := 45;
    WizardForm.NextButton.Left  := WizardForm.NextButton.Left  - ExtraWidth;
    WizardForm.NextButton.Width := WizardForm.NextButton.Width + ExtraWidth;
    // Set initial label based on checkbox state (pre-checked = Launch TaskMesh)
    if (CelebLaunchCheck <> nil) and CelebLaunchCheck.Checked then
      WizardForm.NextButton.Caption := 'Launch TaskMesh'
    else
      WizardForm.NextButton.Caption := 'Close';
  end else
    WizardForm.NextButton.Caption := SetupMessage(msgButtonNext);
end;

// ── ShouldSkipPage ────────────────────────────────────────────────────────────
// 1. Always hide the built-in Select Tasks page — our OptionsPage handles it.
// 2. Skip AIModelPage when AI is not selected, or /OLLAMAMODEL= was supplied.
// 3. In quiet mode, skip every wizard page — all values come from CLI params.
function ShouldSkipPage(PageID: Integer): Boolean;
begin
  if PageID = wpSelectTasks then begin
    Result := True;
    Exit;
  end;

  if (AIModelPage <> nil) and (PageID = AIModelPage.ID) then begin
    // Skip when AI component not selected, a model was forced via CLI, or quiet mode.
    Result := (not IsComponentSelected('ai'))
           or (ExpandConstant('{param:OLLAMAMODEL|}') <> '')
           or IsQuietMode();
    Exit;
  end;

  Result := IsQuietMode();
end;

// ── DeinitializeSetup ─────────────────────────────────────────────────────────
// Called when the installer exits. If the install completed successfully and
// the user left the launch checkbox checked, open TaskMesh in the browser.
procedure DeinitializeSetup;
var
  ResultCode: Integer;
begin
  if not InstallCompleted then Exit;
  if (CelebLaunchCheck = nil) or (not CelebLaunchCheck.Checked) then Exit;
  Exec(ExpandConstant('{sys}\wscript.exe'),
       '"' + ExpandConstant('{app}\scripts\launch-taskmesh.vbs') + '"',
       ExpandConstant('{app}'), SW_SHOW, ewNoWait, ResultCode);
end;
