import { app } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface DesktopSettings {
  /** Адрес дашборда: сервер (https://dashboard.example.com) или локальный (http://localhost:3300). */
  serverUrl: string | null;
}

const DEFAULTS: DesktopSettings = { serverUrl: null };

/** Настройки хранятся в JSON в папке пользователя (%APPDATA%/Personal Dashboard). */
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
