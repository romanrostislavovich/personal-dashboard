/**
 * What the desktop app (Electron preload) adds to the page as `window.desktop`.
 * In a regular browser it is absent.
 */
export interface DesktopBridge {
  /** A native system notification; clicking it opens the app on `route`. */
  notify?(notification: { title: string; body: string; route?: string }): void;
  /** Called when a system notification was clicked. */
  onNavigate?(callback: (route: string) => void): void;
}

export function desktopBridge(): DesktopBridge | null {
  return (window as { desktop?: DesktopBridge }).desktop ?? null;
}
