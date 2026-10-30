import {app} from 'electron';
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';

export interface DesktopSettings {
  /** Dashboard address: a server (https://dashboard.example.com) or local (http://localhost:3300). */
  serverUrl: string | null;
  /**
   * Start with the system (on unless switched off in the tray). Kept here and applied on every
   * start: the system remembers the path of the program, and an update may move it.
   */
  startWithSystem: boolean;
  /** The app restarted itself to install an update: it comes back the way it was, in the tray. */
  startHiddenOnce: boolean;
  /** Where the copies of one's data go (backup/backup-folder.ts); `null` — the default one. */
  backupFolder: string | null;
  /** How many copies are kept. */
  backupKeep: number;
  /** This computer in Settings → Apps: made once, so it is one line however often it reports. */
  installId: string | null;
  /** Where the screenshots go (screenshots/screenshot-folder.ts); `null` — the default one. */
  screenshotsFolder: string | null;
  /** Explicit telemetry opt-in for exactly this server/device, independent of activity tracking. */
  telemetryConsent: {serverUrl: string; deviceId: string} | null;
  /** Optional local break suggestions; never implied by telemetry consent. */
  smartBreakConsent: {serverUrl: string; deviceId: string} | null;
  /** Native picker only, scoped to the current device/server. Never supplied by a restore plan. */
  workstateContext: {
    serverUrl: string;
    deviceId: string;
    projectPath: string | null;
    idePath: string | null;
  } | null;
}

const DEFAULTS: DesktopSettings = {
  serverUrl: null,
  startWithSystem: true,
  startHiddenOnce: false,
  backupFolder: null,
  backupKeep: 14,
  installId: null,
  screenshotsFolder: null,
  telemetryConsent: null,
  smartBreakConsent: null,
  workstateContext: null,
};

export function hasSmartBreakConsent(
  settings: DesktopSettings,
  serverUrl: string | null,
  deviceId: string | null,
): boolean {
  return (
    !!serverUrl &&
    !!deviceId &&
    settings.smartBreakConsent?.serverUrl === serverUrl &&
    settings.smartBreakConsent?.deviceId === deviceId
  );
}

export function hasTelemetryConsent(
  settings: DesktopSettings,
  serverUrl: string | null,
  deviceId: string | null,
): boolean {
  return (
    !!serverUrl &&
    !!deviceId &&
    settings.telemetryConsent?.serverUrl === serverUrl &&
    settings.telemetryConsent?.deviceId === deviceId
  );
}

/** Documents\Personal Dashboard\Backups: where a person looks for their files. */
export function backupFolder(settings: DesktopSettings): string {
  return (
    settings.backupFolder ??
    join(app.getPath('documents'), 'Personal Dashboard', 'Backups')
  );
}

/** Pictures\Personal Dashboard: where the screenshots of the app go and are synced. */
export function screenshotsFolder(settings: DesktopSettings): string {
  return (
    settings.screenshotsFolder ??
    join(app.getPath('pictures'), 'Personal Dashboard')
  );
}

/** Settings are stored as JSON in the user folder (%APPDATA%/Personal Dashboard). */
function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json');
}

export function loadSettings(): DesktopSettings {
  const path = settingsPath();
  if (!existsSync(path)) {
    return DEFAULTS;
  }
  try {
    return {...DEFAULTS, ...JSON.parse(readFileSync(path, 'utf8'))};
  } catch {
    return DEFAULTS;
  }
}

/** The id of this computer in Settings → Apps; made on the first call. */
export function installId(): string {
  const settings = loadSettings();
  if (settings.installId) {
    return settings.installId;
  }
  const id = randomUUID();
  saveSettings({...settings, installId: id});
  return id;
}

export function saveSettings(settings: DesktopSettings): void {
  writeFileSync(settingsPath(), JSON.stringify(settings, null, 2));
}
