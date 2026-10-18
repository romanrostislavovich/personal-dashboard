import { AppDownload, AppPlatform } from '@pd/contracts';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/*
 * What this server hands out to the apps, read from the folders it serves:
 * - the desktop app's code (DESKTOP_BUNDLE_PATH, `/desktop-updates`) — the app updates itself;
 * - the browser extension (EXTENSION_BUNDLE_PATH, `/extension-updates`) — the desktop app keeps
 *   its folder up to date, and a zip of it is downloaded from there too;
 * - the desktop installers (DESKTOP_INSTALLERS_PATH, `/downloads/desktop`) — put there by
 *   deploy/deploy.sh, rarely: the code inside updates itself anyway.
 */

export const DESKTOP_UPDATES_PATH = '/desktop-updates';
export const EXTENSION_UPDATES_PATH = '/extension-updates';
export const DESKTOP_DOWNLOADS_PATH = '/downloads/desktop';

/** The zip of the extension, next to its files. */
const EXTENSION_ZIP = 'personal-dashboard-extension.zip';
/** What deploy.sh writes next to the installers. */
const INSTALLERS_MANIFEST = 'installers.json';

/** Where the installers are when this server has none: the releases of the project. */
const RELEASES_URL = 'https://github.com/romanrostislavovich/personal-dashboard/releases/latest';

/** `bundle.json` of a bundle folder: its version; `null` — no folder, or not a bundle. */
export function bundleVersion(dir: string | undefined): string | null {
  if (!dir) {
    return null;
  }
  try {
    const manifest = JSON.parse(readFileSync(join(dir, 'bundle.json'), 'utf8')) as {
      version?: unknown;
    };
    return typeof manifest.version === 'string' ? manifest.version : null;
  } catch {
    return null;
  }
}

interface InstallersManifest {
  files: { platform: AppPlatform; file: string }[];
}

/**
 * The desktop installers: those this server keeps, and GitHub Releases for the systems it has
 * none for (macOS always: a `.dmg` is built only on a Mac).
 */
export function desktopDownloads(dir: string | undefined): AppDownload[] {
  const kept = readInstallers(dir);
  const platforms: AppPlatform[] = ['windows', 'macos', 'linux'];
  return platforms.map((platform) => {
    const file = kept.find((candidate) => candidate.platform === platform);
    return file && dir
      ? {
          platform,
          url: `${DESKTOP_DOWNLOADS_PATH}/${encodeURIComponent(file.file)}`,
          size: statSync(join(dir, file.file)).size,
          external: false,
        }
      : { platform, url: RELEASES_URL, size: null, external: true };
  });
}

export function extensionDownloads(dir: string | undefined): AppDownload[] {
  const zip = dir ? join(dir, EXTENSION_ZIP) : null;
  return zip && existsSync(zip)
    ? [
        {
          platform: 'chrome',
          url: `${EXTENSION_UPDATES_PATH}/${EXTENSION_ZIP}`,
          size: statSync(zip).size,
          external: false,
        },
      ]
    : [];
}

function readInstallers(dir: string | undefined): InstallersManifest['files'] {
  if (!dir) {
    return [];
  }
  try {
    const manifest = JSON.parse(
      readFileSync(join(dir, INSTALLERS_MANIFEST), 'utf8'),
    ) as InstallersManifest;
    return (manifest.files ?? []).filter((file) => existsSync(join(dir, file.file)));
  } catch {
    return [];
  }
}
