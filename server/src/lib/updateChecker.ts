import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { prisma } from './prisma.js';

interface UpdateStatus {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  justUpdated: boolean;
  releaseNotes: string | null;
  releaseDate: string | null;
  checkedAt: string | null;
  stagedVersion: string | null;
  scheduledApplyAt: string | null;
  warningActive: boolean;
  delayUsed: boolean;
  scheduleDay: number;
  scheduleHour: number;
}

const status: UpdateStatus = {
  currentVersion: '0.0.0',
  latestVersion: null,
  updateAvailable: false,
  justUpdated: false,
  releaseNotes: null,
  releaseDate: null,
  checkedAt: null,
  stagedVersion: null,
  scheduledApplyAt: null,
  warningActive: false,
  delayUsed: false,
  scheduleDay: 0,
  scheduleHour: 9,
};

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let applyTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
let warningTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
let warningAcknowledged = false;
let scheduledApplyAt: Date | null = null;

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

function calculateNextScheduledTime(day: number, hour: number): Date {
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);

  const currentDay = now.getDay(); // 0 = Sunday
  let daysUntil = day - currentDay;
  if (daysUntil < 0) daysUntil += 7;
  if (daysUntil === 0 && next <= now) daysUntil = 7;

  next.setDate(now.getDate() + daysUntil);
  return next;
}

async function scheduleAutoApply(): Promise<void> {
  // Clear any existing timers
  if (applyTimeoutHandle !== null) { clearTimeout(applyTimeoutHandle); applyTimeoutHandle = null; }
  if (warningTimeoutHandle !== null) { clearTimeout(warningTimeoutHandle); warningTimeoutHandle = null; }

  let settings: { updateStagedVersion: string | null; updateScheduleDay: number; updateScheduleHour: number; updateDelayedUntil: Date | null; updateDelayUsed: boolean } | null = null;
  try {
    settings = await prisma.appSettings.findUnique({
      where: { id: 'singleton' },
      select: { updateStagedVersion: true, updateScheduleDay: true, updateScheduleHour: true, updateDelayedUntil: true, updateDelayUsed: true },
    });
  } catch {
    return;
  }

  if (!settings?.updateStagedVersion) return;

  const day = settings.updateScheduleDay ?? 0;
  const hour = settings.updateScheduleHour ?? 9;

  let applyAt: Date;
  if (settings.updateDelayedUntil && settings.updateDelayedUntil > new Date()) {
    applyAt = settings.updateDelayedUntil;
  } else {
    applyAt = calculateNextScheduledTime(day, hour);
  }

  scheduledApplyAt = applyAt;
  status.scheduledApplyAt = applyAt.toISOString();
  status.delayUsed = settings.updateDelayUsed ?? false;

  const now = Date.now();
  const applyMs = applyAt.getTime() - now;
  const warnMs = applyMs - 5 * 60 * 1000;

  warningAcknowledged = false;

  if (applyMs <= 0) {
    // Already past apply time — apply immediately
    applyUpdate().catch(err => console.error('[autoApply] immediate apply failed:', err));
    return;
  }

  if (warnMs > 0) {
    warningTimeoutHandle = setTimeout(() => {
      status.warningActive = true;
      warningAcknowledged = false;
    }, warnMs);
  } else {
    // Already in the warning window
    status.warningActive = true;
  }

  applyTimeoutHandle = setTimeout(() => {
    status.warningActive = false;
    warningAcknowledged = false;
    applyUpdate().catch(err => console.error('[autoApply] scheduled apply failed:', err));
  }, applyMs);
}

let downloading = false;

async function downloadUpdate(): Promise<void> {
  if (downloading) return;
  const os_type = detectOS();
  if (os_type === 'docker') return;

  const version = status.latestVersion;
  if (!version) return;

  // Skip if already staged for this version
  try {
    const settings = await prisma.appSettings.findUnique({
      where: { id: 'singleton' },
      select: { updateStagedVersion: true, updateStagedPath: true },
    });
    if (settings?.updateStagedVersion === version && settings.updateStagedPath && fs.existsSync(settings.updateStagedPath)) {
      status.stagedVersion = version;
      await scheduleAutoApply();
      return;
    }
  } catch {
    // continue
  }

  const release = await fetchGitHubRelease(`v${version}`);
  if (!release) return;

  const assetName = os_type === 'windows' ? 'TaskMesh-Setup.exe' : 'TaskMesh-Installer.tar.gz';
  const asset = release.assets.find(a => a.name === assetName);
  if (!asset) return;

  const stagingDir = path.join(os.tmpdir(), 'taskmesh-staged');
  try {
    if (!fs.existsSync(stagingDir)) fs.mkdirSync(stagingDir, { recursive: true });
  } catch {
    return;
  }

  const ext = os_type === 'windows' ? '.exe' : '.tar.gz';
  const baseName = os_type === 'windows' ? 'TaskMesh-Setup' : 'TaskMesh-Installer';
  const stagingPath = path.join(stagingDir, `${baseName}-${version}${ext}`);

  downloading = true;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30 * 60 * 1000); // 30 min timeout
    const response = await fetch(asset.browser_download_url, { signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok || !response.body) throw new Error('Download response not ok');

    const writer = fs.createWriteStream(stagingPath);
    await pipeline(Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]), writer);
  } catch (err) {
    console.error('[updateChecker] download failed:', err);
    downloading = false;
    return;
  }
  downloading = false;

  // Persist staged info
  try {
    await prisma.appSettings.upsert({
      where: { id: 'singleton' },
      create: {
        id: 'singleton',
        updateStagedVersion: version,
        updateStagedPath: stagingPath,
        updateDelayUsed: false,
        updateDelayedUntil: null,
      },
      update: {
        updateStagedVersion: version,
        updateStagedPath: stagingPath,
        updateDelayUsed: false,
        updateDelayedUntil: null,
      },
    });
  } catch {
    // Non-critical
  }

  status.stagedVersion = version;

  // Create bell notification with action button
  const broadcastId = `update-staged-v${version}`;
  try {
    await prisma.notification.upsert({
      where: { broadcastId },
      create: {
        source: 'update-checker',
        broadcastId,
        title: `Update ${version} downloaded`,
        message: `Just needs to be applied — your scheduled time will handle it automatically, or you can apply it now.`,
        severity: 'info',
        actionLabel: 'Apply Update',
        actionRoute: 'updates',
      },
      update: {},
    });
  } catch {
    // Non-critical
  }

  // Remove the old "update available" notification so the new one is the visible one
  try {
    await prisma.notification.updateMany({
      where: { broadcastId: `update-available-v${version}` },
      data: { dismissed: true },
    });
  } catch {
    // Non-critical
  }

  await scheduleAutoApply();
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
      // Auto-update is on — download in background, no "available" notification needed
      downloadUpdate().catch(() => {});
      return;
    }

    // Auto-update off — just notify the user an update exists
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

export async function delayUpdate(): Promise<void> {
  const delayedUntil = new Date(Date.now() + 60 * 60 * 1000);
  try {
    await prisma.appSettings.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', updateDelayedUntil: delayedUntil, updateDelayUsed: true },
      update: { updateDelayedUntil: delayedUntil, updateDelayUsed: true },
    });
  } catch {
    // Non-critical
  }
  status.warningActive = false;
  status.delayUsed = true;
  warningAcknowledged = false;
  await scheduleAutoApply();
}

export function acknowledgeWarning(): void {
  warningAcknowledged = true;
}

export async function rescheduleFromDB(): Promise<void> {
  await scheduleAutoApply();
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

    // Restore schedule prefs and staged state from DB
    if (settings) {
      status.scheduleDay = settings.updateScheduleDay ?? 0;
      status.scheduleHour = settings.updateScheduleHour ?? 9;
      status.stagedVersion = settings.updateStagedVersion ?? null;
      status.delayUsed = settings.updateDelayUsed ?? false;
    }

    await prisma.appSettings.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', lastSeenVersion: status.currentVersion },
      update: { lastSeenVersion: status.currentVersion },
    });
  } catch {
    // Non-critical
  }

  // Re-schedule auto-apply if a staged update exists
  await scheduleAutoApply();

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
  if (applyTimeoutHandle !== null) {
    clearTimeout(applyTimeoutHandle);
    applyTimeoutHandle = null;
  }
  if (warningTimeoutHandle !== null) {
    clearTimeout(warningTimeoutHandle);
    warningTimeoutHandle = null;
  }
}

export function getUpdateStatus(): UpdateStatus {
  return {
    ...status,
    warningActive: status.warningActive && !warningAcknowledged,
    scheduledApplyAt: scheduledApplyAt?.toISOString() ?? null,
  };
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

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export async function enableAutoUpdate(day = 0, hour = 9): Promise<void> {
  const os_type = detectOS();
  if (os_type === 'docker') return;

  // Persist the schedule to DB
  try {
    await prisma.appSettings.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', updateScheduleDay: day, updateScheduleHour: hour },
      update: { updateScheduleDay: day, updateScheduleHour: hour },
    });
    status.scheduleDay = day;
    status.scheduleHour = hour;
  } catch { /* non-critical */ }

  if (os_type === 'windows') {
    const updaterScript = path.join(__dirname, '../../../updater/check-updates.ps1');
    if (!fs.existsSync(updaterScript)) {
      throw new Error('Updater script not found. Reinstall TaskMesh to enable auto-updates.');
    }
    const dayName = DAYS_OF_WEEK[day] ?? 'Sunday';
    const timeStr = `${String(hour).padStart(2, '0')}:00`;
    await runPowerShell([
      `$action         = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NonInteractive -NoProfile -ExecutionPolicy Bypass -File "${updaterScript}"')`,
      `$weeklyTrigger  = New-ScheduledTaskTrigger -Weekly -DaysOfWeek ${dayName} -At '${timeStr}'`,
      `$startupTrigger = New-ScheduledTaskTrigger -AtStartup`,
      `$startupTrigger.Delay = 'PT5M'`,
      `$principal      = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest`,
      `$settings       = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Hours 1) -StartWhenAvailable`,
      `Unregister-ScheduledTask -TaskName 'TaskMeshUpdateCheck' -Confirm:$false -ErrorAction SilentlyContinue`,
      `Register-ScheduledTask -TaskName 'TaskMeshUpdateCheck' -Action $action -Trigger @($weeklyTrigger, $startupTrigger) -Principal $principal -Settings $settings -Description 'TaskMesh auto-updater — weekly + startup catch-up' | Out-Null`,
      `Set-ItemProperty -Path 'HKLM:\\Software\\TaskMesh' -Name 'AutoUpdateEnabled' -Value '1' -ErrorAction SilentlyContinue`,
    ].join('; '));
  } else {
    // Linux — write /etc/cron.d/taskmesh
    const installDir = getLinuxInstallDir();
    const updaterScript = path.join(installDir, 'scripts/check-updates.sh');
    if (!fs.existsSync(updaterScript)) {
      throw new Error('Updater script not found. Reinstall TaskMesh to enable auto-updates.');
    }
    const cronSpec = `0 ${hour} * * ${day}`;
    fs.writeFileSync(
      '/etc/cron.d/taskmesh',
      `# TaskMesh weekly auto-update (managed by TaskMesh — do not edit manually)\n${cronSpec} root bash ${updaterScript}\n`,
      'utf8'
    );
    updateLinuxConfig('AUTO_UPDATE_ENABLED', '1');
  }

  // Re-schedule in-memory timers with new schedule
  await scheduleAutoApply();
}

export async function disableAutoUpdate(): Promise<void> {
  const os_type = detectOS();
  if (os_type === 'docker') return;

  if (os_type === 'windows') {
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

  const os_type = detectOS();

  if (os_type === 'docker') {
    throw new Error('Updates are managed by your Docker host. Pull the latest image and recreate the container.');
  }

  if (os_type === 'windows') {
    // Check for a pre-staged installer first
    let stagedPath: string | null = null;
    try {
      const settings = await prisma.appSettings.findUnique({
        where: { id: 'singleton' },
        select: { updateStagedPath: true, updateStagedVersion: true },
      });
      if (settings?.updateStagedVersion === status.latestVersion && settings.updateStagedPath && fs.existsSync(settings.updateStagedPath)) {
        stagedPath = settings.updateStagedPath;
      }
    } catch { /* fall through */ }

    if (!stagedPath) {
      // Pre-flight: verify the installer asset exists on GitHub before triggering anything.
      const preflightRelease = await fetchGitHubRelease(`v${status.latestVersion}`);
      if (!preflightRelease) throw new Error('Could not fetch release details from GitHub');
      const preflightAsset = preflightRelease.assets.find(a => a.name === 'TaskMesh-Setup.exe');
      if (!preflightAsset) throw new Error(`TaskMesh-Setup.exe is missing from the v${status.latestVersion} release. The update cannot proceed — please try again later.`);
    }

    // Prefer the pre-installed updater script (always present when auto-update is enabled).
    const updaterScript = path.join(__dirname, '../../../updater/check-updates.ps1');
    if (fs.existsSync(updaterScript)) {
      const launcher = spawn('schtasks', [
        '/Run', '/TN', 'TaskMesh-ApplyUpdate',
      ], { detached: true, stdio: 'ignore' });
      launcher.on('error', (err) => console.error('[applyUpdate] task trigger error:', err));
      launcher.unref();
      return;
    }

    // Fallback: use staged file if available, otherwise download
    const installerPath = stagedPath ?? path.join(os.tmpdir(), `TaskMesh-Setup-${status.latestVersion}.exe`);

    if (!stagedPath) {
      const release = await fetchGitHubRelease(`v${status.latestVersion}`);
      if (!release) throw new Error('Could not fetch release details from GitHub');
      const asset = release.assets.find(a => a.name === 'TaskMesh-Setup.exe');
      if (!asset) throw new Error('TaskMesh-Setup.exe not found in release assets');

      const script = [
        `$url = '${asset.browser_download_url}'`,
        `$out = '${installerPath.replace(/'/g, "''")}'`,
        `Invoke-WebRequest -Uri $url -OutFile $out -UseBasicParsing`,
        `& sc.exe stop TaskMesh-Server`,
        `Start-Sleep -Seconds 5`,
        `Start-Process -FilePath $out -ArgumentList '/QUIET','/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART' -Wait`,
      ].join('; ');

      const child = spawn('powershell.exe', [
        '-NonInteractive', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script,
      ], { detached: true, stdio: 'ignore' });
      child.unref();
      return;
    }

    // Run the staged installer directly via scheduled task approach
    const script = [
      `& sc.exe stop TaskMesh-Server`,
      `Start-Sleep -Seconds 5`,
      `Start-Process -FilePath '${installerPath.replace(/'/g, "''")}' -ArgumentList '/QUIET','/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART' -Wait`,
    ].join('; ');

    const child = spawn('powershell.exe', [
      '-NonInteractive', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script,
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
