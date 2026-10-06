import { app } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

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
}

const DEFAULTS: DesktopSettings = {
  serverUrl: null,
  startWithSystem: true,
  startHiddenOnce: false,
};

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
    return { ...DEFAULTS, ...JSON.parse(readFileSync(path, 'utf8')) };
  } catch {
    return DEFAULTS;
  }
}

export function saveSettings(settings: DesktopSettings): void {
  writeFileSync(settingsPath(), JSON.stringify(settings, null, 2));
}
