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
