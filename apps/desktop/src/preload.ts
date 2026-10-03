import { contextBridge, ipcRenderer } from 'electron';

/**
 * `window.desktop` — what the shell adds to the pages it shows:
 * - the setup page (setup.html) reads and saves the server address;
 * - the dashboard shows native system notifications and opens a page when one is clicked
 *   (see DesktopBridge in the web core);
 * - the Activity section switches the tracker of this computer on and off and runs focus
 *   sessions.
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
});
