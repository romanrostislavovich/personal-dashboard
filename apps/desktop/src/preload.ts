import { contextBridge, ipcRenderer } from 'electron';

/**
 * `window.desktop` — what the shell adds to the pages it shows:
 * - the setup page (setup.html) reads and saves the server address;
 * - the dashboard shows native system notifications and opens a page when one is clicked
 *   (see DesktopBridge in the web core).
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
});
