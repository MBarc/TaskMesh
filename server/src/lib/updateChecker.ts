import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { prisma } from './prisma.js';

interface UpdateStatus {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  justUpdated: boolean;
  releaseNotes: string | null;
  releaseDate: string | null;
  checkedAt: string | null;
}

const status: UpdateStatus = {
  currentVersion: '0.0.0',
  latestVersion: null,
  updateAvailable: false,
  justUpdated: false,
  releaseNotes: null,
  releaseDate: null,
  checkedAt: null,
};

let intervalHandle: ReturnType<typeof setInterval> | null = null;

function readCurrentVersion(): string {
  try {
    const pkgPath = path.join(__dirname, '../../package.json');
    const raw = fs.readFileSync(pkgPath, 'utf8');
    const pkg = JSON.parse(raw) as { version?: string };
    if (typeof pkg.version === 'string' && pkg.version) {
      return pkg.version;
    }
  } catch {
    // fall through
  }
  return process.env.npm_package_version ?? '0.0.0';
}

function parseVersion(v: string): number[] {
  return v.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
}

function isNewer(candidate: string, current: string): boolean {
  const c = parseVersion(candidate);
  const cur = parseVersion(current);
  for (let i = 0; i < Math.max(c.length, cur.length); i++) {
    const a = c[i] ?? 0;
    const b = cur[i] ?? 0;
    if (a > b) return true;
    if (a < b) return false;
  }
  return false;
}

interface GitHubRelease {
  tag_name: string;
  body: string;
  published_at: string;
  assets: Array<{ name: string; browser_download_url: string }>;
}

function detectOS(): 'windows' | 'linux' | 'docker' {
  if (process.env.NODE_OS) return process.env.NODE_OS as 'windows' | 'linux' | 'docker';
  if (fs.existsSync('/.dockerenv')) return 'docker';
  return process.platform === 'win32' ? 'windows' : 'linux';
}

async function fetchGitHubRelease(tag?: string): Promise<GitHubRelease | null> {
  const url = tag
    ? `https://api.github.com/repos/MBarc/TaskMesh/releases/tags/${tag}`
    : 'https://api.github.com/repos/MBarc/TaskMesh/releases/latest';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'TaskMesh-UpdateChecker',
      },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return (await res.json()) as GitHubRelease;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

export async function checkForUpdates(): Promise<void> {
  try {
    const release = await fetchGitHubRelease();
    if (!release) return;

    const latestVersion = release.tag_name.replace(/^v/, '');
    status.checkedAt = new Date().toISOString();

    if (!isNewer(latestVersion, status.currentVersion)) {
      return;
    }

    status.updateAvailable = true;
    status.latestVersion = latestVersion;
    status.releaseNotes = release.body ?? null;
    status.releaseDate = release.published_at ?? null;

    const settings = await prisma.appSettings.findUnique({ where: { id: 'singleton' } });
    if (settings?.autoUpdateEnabled) {
      return;
    }

    const broadcastId = `update-available-v${latestVersion}`;
    await prisma.notification.upsert({
      where: { broadcastId },
      create: {
        source: 'update-checker',
        broadcastId,
        title: `TaskMesh v${latestVersion} is available`,
        message: `A new version of TaskMesh is ready. [View release notes](https://github.com/MBarc/TaskMesh/releases/latest)`,
        severity: 'info',
      },
      update: {},
    });
  } catch {
    // Completely silent on all errors
  }
}

async function initializeUpdateChecker(): Promise<void> {
  status.currentVersion = readCurrentVersion();

  try {
    const settings = await prisma.appSettings.findUnique({ where: { id: 'singleton' } });
    const lastSeen = settings?.lastSeenVersion ?? null;

    if (lastSeen && lastSeen !== status.currentVersion) {
      status.justUpdated = true;
      const tag = `v${status.currentVersion}`;
      const release = await fetchGitHubRelease(tag);
      if (release) {
        status.releaseNotes = release.body ?? null;
        status.releaseDate = release.published_at ?? null;
      }
    }

    await prisma.appSettings.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', lastSeenVersion: status.currentVersion },
      update: { lastSeenVersion: status.currentVersion },
    });
  } catch {
    // Non-critical
  }

  await checkForUpdates();
}

export function startUpdateChecker(): void {
  initializeUpdateChecker().catch(() => {});
  intervalHandle = setInterval(() => {
    checkForUpdates().catch(() => {});
  }, 24 * 60 * 60 * 1000);
}

export function stopUpdateChecker(): void {
  if (intervalHandle !== null) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

export function getUpdateStatus(): UpdateStatus {
  return { ...status };
}

// ── Auto-update management helpers ───────────────────────────────────────────

function getLinuxInstallDir(): string {
  try {
    const config = fs.readFileSync('/etc/taskmesh/config', 'utf8');
    const match = config.match(/^INSTALL_DIR=(.+)$/m);
    if (match) return match[1].trim();
  } catch { /* use default */ }
  return '/opt/taskmesh';
}

function updateLinuxConfig(key: string, value: string): void {
  const configPath = '/etc/taskmesh/config';
  try {
    let config = fs.readFileSync(configPath, 'utf8');
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(config)) {
      config = config.replace(regex, `${key}=${value}`);
    } else {
      config += `\n${key}=${value}\n`;
    }
    fs.writeFileSync(configPath, config, 'utf8');
  } catch { /* non-critical */ }
}

function runPowerShell(command: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', [
      '-NonInteractive', '-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-Command', command,
    ], { stdio: 'ignore' });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`PowerShell exited with code ${code}`));
    });
  });
}

export async function enableAutoUpdate(): Promise<void> {
  const os = detectOS();
  if (os === 'docker') return;

  if (os === 'windows') {
    const updaterScript = path.join(__dirname, '../../../updater/check-updates.ps1');
    if (!fs.existsSync(updaterScript)) {
      throw new Error('Updater script not found. Reinstall TaskMesh to enable auto-updates.');
    }
    await runPowerShell([
      `$action         = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NonInteractive -NoProfile -ExecutionPolicy Bypass -File "${updaterScript}"')`,
      `$weeklyTrigger  = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At '09:00'`,
      `$startupTrigger = New-ScheduledTaskTrigger -AtStartup`,
      `$startupTrigger.Delay = 'PT5M'`,
      `$principal      = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest`,
      `$settings       = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Hours 1) -StartWhenAvailable $true`,
      `Unregister-ScheduledTask -TaskName 'TaskMeshUpdateCheck' -Confirm:$false -ErrorAction SilentlyContinue`,
      `Register-ScheduledTask -TaskName 'TaskMeshUpdateCheck' -Action $action -Trigger @($weeklyTrigger, $startupTrigger) -Principal $principal -Settings $settings -Description 'TaskMesh auto-updater — weekly + startup catch-up' | Out-Null`,
      `Set-ItemProperty -Path 'HKLM:\\Software\\TaskMesh' -Name 'AutoUpdateEnabled' -Value '1' -ErrorAction SilentlyContinue`,
    ].join('; '));
  } else {
    // Linux — write /etc/cron.d/taskmesh (service runs as root)
    const installDir = getLinuxInstallDir();
    const updaterScript = path.join(installDir, 'scripts/check-updates.sh');
    if (!fs.existsSync(updaterScript)) {
      throw new Error('Updater script not found. Reinstall TaskMesh to enable auto-updates.');
    }
    fs.writeFileSync(
      '/etc/cron.d/taskmesh',
      `# TaskMesh weekly auto-update (managed by TaskMesh — do not edit manually)\n0 9 * * 0 root bash ${updaterScript}\n`,
      'utf8'
    );
    updateLinuxConfig('AUTO_UPDATE_ENABLED', '1');
  }
}

export async function disableAutoUpdate(): Promise<void> {
  const os = detectOS();
  if (os === 'docker') return;

  if (os === 'windows') {
    await runPowerShell([
      `Unregister-ScheduledTask -TaskName 'TaskMeshUpdateCheck' -Confirm:$false -ErrorAction SilentlyContinue`,
      `Set-ItemProperty -Path 'HKLM:\\Software\\TaskMesh' -Name 'AutoUpdateEnabled' -Value '0' -ErrorAction SilentlyContinue`,
    ].join('; '));
  } else {
    try { fs.unlinkSync('/etc/cron.d/taskmesh'); } catch { /* already gone */ }
    updateLinuxConfig('AUTO_UPDATE_ENABLED', '0');
  }
}

export async function applyUpdate(): Promise<void> {
  if (!status.updateAvailable || !status.latestVersion) {
    throw new Error('No update available');
  }

  const os = detectOS();

  if (os === 'docker') {
    throw new Error('Updates are managed by your Docker host. Pull the latest image and recreate the container.');
  }

  if (os === 'windows') {
    // Pre-flight: verify the installer asset exists on GitHub before triggering anything.
    // Without this, a release published without TaskMesh-Setup.exe causes the scheduled
    // task to exit silently and the UI to poll indefinitely with no feedback.
    const preflightRelease = await fetchGitHubRelease(`v${status.latestVersion}`);
    if (!preflightRelease) throw new Error('Could not fetch release details from GitHub');
    const preflightAsset = preflightRelease.assets.find(a => a.name === 'TaskMesh-Setup.exe');
    if (!preflightAsset) throw new Error(`TaskMesh-Setup.exe is missing from the v${status.latestVersion} release. The update cannot proceed — please try again later.`);

    // Prefer the pre-installed updater script (always present when auto-update is enabled).
    // Falls back to spawning a fresh download directly if the script is somehow missing.
    const updaterScript = path.join(__dirname, '../../../updater/check-updates.ps1');
    if (fs.existsSync(updaterScript)) {
      // Trigger the pre-registered TaskMesh-ApplyUpdate scheduled task.
      //
      // Why this works:
      //   install-services.ps1 registers "TaskMesh-ApplyUpdate" at install time as SYSTEM
      //   with RunLevel Highest. Start-ScheduledTask sends a single RPC to the Task Scheduler
      //   service, which starts check-updates.ps1 in its own process tree — outside the NSSM
      //   Job Object — running as SYSTEM with full admin rights.
      //
      // Why previous approaches failed:
      //   - spawn() / ps-launcher.exe: child inherits the NSSM Job Object; killed on nssm stop.
      //   - schtasks /Create + /Run: schtasks /Create silently fails from a SYSTEM service on
      //     Windows 10/11 (task XML never written to System32\Tasks).
      //   - Win32_Process.Create() via WMI: creates the process in the CALLER's user context,
      //     not as SYSTEM — so the installer runs without elevation and exits with code 2 (UAC).
      // Use schtasks /Run (RPC-based) rather than Start-ScheduledTask (CIM/WMI)
      // so the trigger works even from inside the NSSM Job Object.
      const launcher = spawn('schtasks', [
        '/Run', '/TN', 'TaskMesh-ApplyUpdate',
      ], { detached: true, stdio: 'ignore' });
      launcher.on('error', (err) => console.error('[applyUpdate] task trigger error:', err));
      launcher.unref();
      return;
    }

    // Fallback: download installer directly and run it
    const release = await fetchGitHubRelease(`v${status.latestVersion}`);
    if (!release) throw new Error('Could not fetch release details from GitHub');

    const asset = release.assets.find(a => a.name === 'TaskMesh-Setup.exe');
    if (!asset) throw new Error('TaskMesh-Setup.exe not found in release assets');

    const tmpPath = path.join(require('os').tmpdir(), `TaskMesh-Setup-${status.latestVersion}.exe`);

    // Download then launch — done in a detached PowerShell so it outlives this process.
    // Stop the service first so the installer can overwrite files, matching the
    // behaviour of check-updates.ps1 (the preferred path).
    const script = [
      `$url = '${asset.browser_download_url}'`,
      `$out = '${tmpPath.replace(/'/g, "''")}'`,
      `Invoke-WebRequest -Uri $url -OutFile $out -UseBasicParsing`,
      `& sc.exe stop TaskMesh-Server`,
      `Start-Sleep -Seconds 5`,
      `Start-Process -FilePath $out -ArgumentList '/QUIET','/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART' -Wait`,
    ].join('; ');

    const child = spawn('powershell.exe', [
      '-NonInteractive', '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-Command', script,
    ], { detached: true, stdio: 'ignore' });
    child.unref();
    return;
  }

  // Linux
  let installDir = '/opt/taskmesh';
  try {
    const config = fs.readFileSync('/etc/taskmesh/config', 'utf8');
    const match = config.match(/^INSTALL_DIR=(.+)$/m);
    if (match) installDir = match[1].trim();
  } catch { /* use default */ }

  const updaterScript = path.join(installDir, 'scripts/check-updates.sh');
  if (fs.existsSync(updaterScript)) {
    const child = spawn('bash', [updaterScript], { detached: true, stdio: 'ignore' });
    child.unref();
    return;
  }

  throw new Error('Updater script not found. Please reinstall TaskMesh to enable in-app updates.');
}
