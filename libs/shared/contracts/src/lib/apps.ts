import {z} from 'zod';

/*
 * The apps of the dashboard besides the web: the desktop app, the browser extension and, later,
 * the mobile one. Settings → Apps downloads them and shows which devices run which version;
 * every app updates itself from the server it is connected to.
 */

export const APP_KINDS = ['desktop', 'extension', 'mobile'] as const;
export type AppKind = (typeof APP_KINDS)[number];

/** What an installer is for. */
export const APP_PLATFORMS = [
  'windows',
  'macos',
  'linux',
  'chrome',
  'android',
  'ios',
] as const;
export type AppPlatform = (typeof APP_PLATFORMS)[number];

export interface AppDownload {
  platform: AppPlatform;
  /** The server's own address (`/downloads/…`), or a page elsewhere (`external`). */
  url: string;
  /** Bytes; unknown for an external page. */
  size: number | null;
  /** On GitHub Releases, not on this server: the server has no installer for it. */
  external: boolean;
}

export interface AppInfo {
  kind: AppKind;
  /** Not made yet: the card says it is coming. */
  soon: boolean;
  /**
   * The version the server hands out to installed apps (the fingerprint of their code); `null` —
   * this server has none, its apps do not update from it.
   */
  version: string | null;
  downloads: AppDownload[];
}

/** One device that runs an app, as it last told the server. */
export interface AppInstall {
  id: string;
  kind: AppKind;
  /** The computer's name, or the browser and the system (`Chrome · Windows`). */
  name: string;
  platform: string;
  version: string;
  lastSeenAt: string;
  /** Runs the version the server hands out. */
  current: boolean;
}

export interface AppsOverview {
  apps: AppInfo[];
  installs: AppInstall[];
}

/** `POST /api/apps/installs`: an app says it runs here, and which version. */
export const appInstallReportSchema = z.object({
  /** Made by the app once and kept: the same device is one line however often it reports. */
  installId: z.uuid(),
  kind: z.enum(APP_KINDS),
  name: z.string().trim().min(1).max(100),
  platform: z.string().trim().min(1).max(40),
  version: z.string().trim().min(1).max(64),
});
export type AppInstallReport = z.infer<typeof appInstallReportSchema>;
