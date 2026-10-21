import { ScreenshotFolder } from '@pd/client-core';
import { DiskAdvice, DiskFix, DiskReport, WritingIssue, WorkstateRestorePlan } from '@pd/contracts';
/**
 * What the desktop app (Electron preload) adds to the page as `window.desktop`.
 * In a regular browser it is absent.
 */
export interface DesktopBridge {
  /** A native system notification; clicking it opens the app on `route`. */
  notify?(notification: { title: string; body: string; route?: string }): void;
  /** Called when a system notification was clicked. */
  onNavigate?(callback: (route: string) => void): void;
  /** Called when "Check for updates" is pressed in the tray (absent in an older shell). */
  onCheckUpdate?(callback: () => void): void;
  /** The activity tracker of this computer (absent in an older shell). */
  activity?: DesktopActivity;
  /** The focus timer (Pomodoro) of this computer (absent in an older shell). */
  focus?: DesktopFocus;
  /** What a shortcut captured (text or a screenshot), for the capture window. */
  capture?: DesktopCapture;
  /** Files the app found in Downloads (bank statements), handed over on a click. */
  downloads?: DesktopDownloads;
  /** Disk cleanup of this computer (absent in an older shell). */
  disk?: DesktopDisk;
  /** Copies of one's data kept on this computer (absent in an older shell). */
  backup?: DeviceBackup;
  /** Settings → Apps: this computer's version, the browser extension's folder (absent in an older shell). */
  apps?: DesktopApps;
  /** The folder of screenshots, kept the same as the server (absent in an older shell). */
  screenshots?: DesktopScreenshots;
  /** Writing in every program of the computer (absent in an older shell). */
  writing?: DesktopWriting;
  /** What the computer tells the assistant as a device (absent in an older shell). */
  device?: DesktopDevice;
  /** Explicit capture and native-confirmed restoration; absent in older desktop builds. */
  workstates?: {
    capture(): Promise<boolean>;
    resume(plan: WorkstateRestorePlan): Promise<{ opened: number; failed: number; canceled: boolean }>;
  };
  telemetry?: {
    status(): Promise<{ enabled: boolean; available: boolean }>;
    setConsent(enabled: boolean): Promise<boolean>;
  };
  smartBreak?: {
    status(): Promise<{ enabled: boolean; available: boolean }>;
    setConsent(enabled: boolean): Promise<boolean>;
  };
}

/** The window in front of the computer, as the tracker sees it (a private one without title). */
export interface DesktopDevice {
  frontWindow(): Promise<{
    app: string;
    name: string | null;
    title: string;
    idleSeconds: number;
  } | null>;
}

/**
 * Writing in the fields of other programs: the app reads them and draws the marks, the page
 * checks the texts (it holds the session) and tells the settings.
 */
export interface DesktopWriting {
  configure(config: { enabled: boolean; ignoredApps: string[] }): Promise<void>;
  onCheck(check: (text: string) => Promise<WritingIssue[]>): void;
  onIgnore(ignore: (what: { word?: string; ruleId?: string }) => Promise<void>): void;
}

/**
 * The folder the screenshots of the desktop app are saved to: the page syncs it with the
 * server (see the Screenshots module); the app only reads and writes its files.
 */
export interface DesktopScreenshots extends ScreenshotFolder {
  status(): Promise<{ folder: string }>;
  chooseFolder(): Promise<{ folder: string }>;
  openFolder(): Promise<void>;
  /** Called when a file of the folder changed (a new screenshot, one deleted in Explorer). */
  onChanged(callback: () => void): void;
}

/** The desktop app in Settings → Apps (see apps/desktop/src/update/extension-keeper.ts). */
export interface DesktopApps {
  info(): Promise<DesktopAppsInfo>;
  /** Opens the folder Chrome loads the extension from (downloads it first if needed). */
  openExtensionFolder(): Promise<void>;
}

export interface DesktopAppsInfo {
  /** This computer's line in the list of devices. */
  installId: string;
  /** The fingerprint of the running code; `null` — run from the sources. */
  version: string | null;
  /** The browser extension, kept up to date by the app. */
  extension: { folder: string; version: string | null };
}

/**
 * A device that keeps the copies of one's data (see DeviceBackupService): the desktop app
 * today, a phone later. It only stores files; the page fetches them.
 */
export interface DeviceBackup {
  status(): Promise<DeviceBackupStatus>;
  /** `personal-dashboard-YYYY-MM-DD.zip`: the day's copy is replaced, the oldest go. */
  save(name: string, data: Uint8Array): Promise<DeviceBackupStatus>;
  openFolder(): Promise<void>;
  chooseFolder(): Promise<DeviceBackupStatus>;
  setKeep(keep: number): Promise<DeviceBackupStatus>;
}

export interface DeviceBackupStatus {
  folder: string;
  keep: number;
  /** The newest first; `savedAt` is ISO. */
  copies: { name: string; size: number; savedAt: string }[];
}

export interface DesktopCapture {
  /** The last capture: copied text, or a PNG of a piece of the screen. */
  pending(): Promise<{ kind: 'text'; text: string } | { kind: 'image'; base64: string } | null>;
  /** Closes the capture window. */
  close(): Promise<void>;
}

export interface DesktopDownloads {
  /** The file of a notification about a statement; `null` — gone, or not one the app found. */
  take(id: string): Promise<{ name: string; base64: string } | null>;
}

/** Scans a disk of this computer and moves what the user picked to the Recycle Bin. */
export interface DesktopDisk {
  status(): Promise<DesktopDiskStatus>;
  /** `C:` — runs in the background; `status()` tells the progress. */
  scan(mount: string): Promise<void>;
  /** Only paths of the last report; protected ones (the system, programs) always stay. */
  trash(paths: string[]): Promise<DesktopTrashResult[]>;
  openRecycleBin(): Promise<void>;
  /** For good: the page confirms it first. Absent in an older shell. */
  emptyRecycleBin?(): Promise<DesktopFixResult>;
  /** One of the app's own cleanups (DISK_FIXES); absent in an older shell. */
  fix?(fix: DiskFix): Promise<DesktopFixResult>;
  /** Shows a path of the last scan in Explorer. */
  reveal?(path: string): Promise<void>;
  /** Keeps the advice with the scan, so a reloaded page does not ask the AI again. */
  keepAdvice?(advice: DiskAdvice): Promise<void>;
  /** Forgets the scan: the panel closes. */
  dismiss?(): Promise<void>;
}

export interface DesktopFixResult {
  ok: boolean;
  /** The end of what the command printed. */
  output: string;
}

export type DesktopDiskStatus =
  | { state: 'idle' }
  | { state: 'scanning'; mount: string; progress: { files: number; bytes: number } }
  | {
      state: 'done';
      report: DiskReport;
      /** When the scan finished (absent in an older shell). */
      scannedAt?: string;
      /** The advice already got for this report, kept by the app across page reloads. */
      advice?: DiskAdvice | null;
    }
  | { state: 'error'; message: string };

export interface DesktopTrashResult {
  path: string;
  ok: boolean;
  reason?: 'protected' | 'unknown' | 'missing' | 'failed';
}

/** The focus timer of the desktop shell; sessions go to the server with the tracker's data. */
export interface DesktopFocus {
  status(): Promise<DesktopFocusStatus>;
  start(options: { projectId?: string | null; note?: string | null }): Promise<void>;
  /** Stops a focus part or skips a break. */
  stop(): Promise<void>;
}

export interface DesktopFocusStatus {
  phase: 'idle' | 'focus' | 'short-break' | 'long-break';
  /** When the current part ends (ISO). */
  endsAt: string | null;
  round: number;
  roundsBeforeLongBreak: number;
  projectId: string | null;
  note: string | null;
  /** A focus session needs tracking enabled on this computer. */
  available: boolean;
}

/** The tracker of the desktop shell: which program is in front and for how long. */
export interface DesktopActivity {
  status(): Promise<DesktopActivityStatus>;
  /** This computer was registered as a device: tracking begins. */
  enable(device: { id: string; token: string }): Promise<void>;
  disable(): Promise<void>;
  /** `minutes` — pause for so long; `0` — until resumed; `null` — resume. */
  pause(minutes: number | null): Promise<void>;
  /** `win32`, `darwin`, `linux`. */
  platform: string;
  hostname: string;
}

export interface DesktopActivityStatus {
  /** The tracker can watch windows on this system. */
  supported: boolean;
  /** The device this computer is registered as; `null` — tracking is not enabled here. */
  deviceId: string | null;
  paused: boolean;
  /** Spans recorded and not sent yet. */
  pending: number;
}

export function desktopBridge(): DesktopBridge | null {
  return (window as { desktop?: DesktopBridge }).desktop ?? null;
}
