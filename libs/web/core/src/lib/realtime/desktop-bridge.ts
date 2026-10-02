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
