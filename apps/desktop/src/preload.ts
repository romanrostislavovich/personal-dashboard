import { contextBridge, ipcRenderer } from 'electron';

/**
 * `window.desktop` — what the shell adds to the pages it shows:
 * - the setup page (setup.html) reads and saves the server address;
 * - the dashboard shows native system notifications and opens a page when one is clicked
 *   (see DesktopBridge in the web core);
 * - the Activity section switches the tracker of this computer on and off, runs focus
 *   sessions and cleans up its disks (scan, move to the Recycle Bin).
 */
contextBridge.exposeInMainWorld('desktop', {
  getServerUrl: (): Promise<string | null> => ipcRenderer.invoke('settings:get-server-url'),
  saveServerUrl: (url: string): Promise<void> =>
    ipcRenderer.invoke('settings:save-server-url', url),
  notify: (notification: { title: string; body: string; route?: string }): void =>
    ipcRenderer.send('desktop:notify', notification),
  onNavigate: (callback: (route: string) => void): void => {
    ipcRenderer.on('desktop:navigate', (_event, route: string) => callback(route));
  },
  activity: {
    status: (): Promise<unknown> => ipcRenderer.invoke('activity:status'),
    enable: (device: { id: string; token: string }): Promise<void> =>
      ipcRenderer.invoke('activity:enable', device),
    disable: (): Promise<void> => ipcRenderer.invoke('activity:disable'),
    pause: (minutes: number | null): Promise<void> => ipcRenderer.invoke('activity:pause', minutes),
    platform: process.platform,
    hostname: process.env['COMPUTERNAME'] ?? process.env['HOSTNAME'] ?? '',
  },
  focus: {
    status: (): Promise<unknown> => ipcRenderer.invoke('focus:status'),
    start: (options: { projectId?: string | null; note?: string | null }): Promise<void> =>
      ipcRenderer.invoke('focus:start', options),
    stop: (): Promise<void> => ipcRenderer.invoke('focus:stop'),
  },
  disk: {
    status: (): Promise<unknown> => ipcRenderer.invoke('disk:status'),
    scan: (mount: string): Promise<void> => ipcRenderer.invoke('disk:scan', mount),
    trash: (paths: string[]): Promise<unknown> => ipcRenderer.invoke('disk:trash', paths),
    openRecycleBin: (): Promise<void> => ipcRenderer.invoke('disk:open-recycle-bin'),
    emptyRecycleBin: (): Promise<unknown> => ipcRenderer.invoke('disk:empty-recycle-bin'),
    fix: (fix: string): Promise<unknown> => ipcRenderer.invoke('disk:fix', fix),
    reveal: (path: string): Promise<void> => ipcRenderer.invoke('disk:reveal', path),
    keepAdvice: (advice: unknown): Promise<void> => ipcRenderer.invoke('disk:keep-advice', advice),
    dismiss: (): Promise<void> => ipcRenderer.invoke('disk:dismiss'),
  },
});
