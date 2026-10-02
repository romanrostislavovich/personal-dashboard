import { app } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface DesktopSettings {
  /** Dashboard address: a server (https://dashboard.example.com) or local (http://localhost:3300). */
  serverUrl: string | null;
  /** Starting with the system was switched on once by default; from then on the user decides. */
  autostartDecided: boolean;
}

const DEFAULTS: DesktopSettings = { serverUrl: null, autostartDecided: false };

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
