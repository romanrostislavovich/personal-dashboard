import { DiskAdvice, DiskFix, DiskReport } from '@pd/contracts';
/**
 * What the desktop app (Electron preload) adds to the page as `window.desktop`.
 * In a regular browser it is absent.
 */
export interface DesktopBridge {
  /** A native system notification; clicking it opens the app on `route`. */
  notify?(notification: { title: string; body: string; route?: string }): void;
  /** Called when a system notification was clicked. */
  onNavigate?(callback: (route: string) => void): void;
  /** The activity tracker of this computer (absent in an older shell). */
  activity?: DesktopActivity;
  /** The focus timer (Pomodoro) of this computer (absent in an older shell). */
  focus?: DesktopFocus;
  /** Files the app found in Downloads (bank statements), handed over on a click. */
  downloads?: DesktopDownloads;
  /** Disk cleanup of this computer (absent in an older shell). */
  disk?: DesktopDisk;
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
