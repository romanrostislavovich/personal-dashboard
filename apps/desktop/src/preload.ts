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
  onCheckUpdate: (callback: () => void): void => {
    ipcRenderer.on('desktop:check-update', () => callback());
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
  capture: {
    pending: (): Promise<unknown> => ipcRenderer.invoke('capture:pending'),
    close: (): Promise<void> => ipcRenderer.invoke('capture:close'),
  },
  /** The full-screen picture to draw the rectangle of a screenshot on (assets/region.html). */
  region: {
    image: (): Promise<string | null> => ipcRenderer.invoke('region:image'),
    done: (rect: { x: number; y: number; width: number; height: number } | null): Promise<void> =>
      ipcRenderer.invoke('region:done', rect),
  },
  /** The editor of a screenshot (assets/annotate.html): the piece, and what was made of it. */
  annotate: {
    image: (): Promise<string | null> => ipcRenderer.invoke('annotate:image'),
    done: (data: Uint8Array, action: 'save' | 'actions' | 'copy'): Promise<void> =>
      ipcRenderer.invoke('annotate:done', data, action),
    cancel: (): Promise<void> => ipcRenderer.invoke('annotate:cancel'),
  },
  /** The folder of screenshots: the dashboard's page syncs it with the server. */
  screenshots: {
    status: (): Promise<unknown> => ipcRenderer.invoke('screenshots:status'),
    list: (): Promise<unknown> => ipcRenderer.invoke('screenshots:list'),
    read: (name: string): Promise<Uint8Array> => ipcRenderer.invoke('screenshots:read', name),
    write: (name: string, data: Uint8Array): Promise<void> =>
      ipcRenderer.invoke('screenshots:write', name, data),
    remove: (name: string): Promise<void> => ipcRenderer.invoke('screenshots:remove', name),
    rename: (from: string, to: string): Promise<void> =>
      ipcRenderer.invoke('screenshots:rename', from, to),
    openFolder: (): Promise<void> => ipcRenderer.invoke('screenshots:open-folder'),
    chooseFolder: (): Promise<unknown> => ipcRenderer.invoke('screenshots:choose-folder'),
    onChanged: (callback: () => void): void => {
      ipcRenderer.on('screenshots:changed', () => callback());
    },
  },
  /** Settings → Apps: this computer's line in the list of devices, the extension's folder. */
  apps: {
    info: (): Promise<unknown> => ipcRenderer.invoke('apps:info'),
    openExtensionFolder: (): Promise<void> => ipcRenderer.invoke('apps:open-extension-folder'),
  },
  backup: {
    status: (): Promise<unknown> => ipcRenderer.invoke('backup:status'),
    save: (name: string, data: Uint8Array): Promise<unknown> =>
      ipcRenderer.invoke('backup:save', name, data),
    openFolder: (): Promise<void> => ipcRenderer.invoke('backup:open-folder'),
    chooseFolder: (): Promise<unknown> => ipcRenderer.invoke('backup:choose-folder'),
    setKeep: (keep: number): Promise<unknown> => ipcRenderer.invoke('backup:keep', keep),
  },
  downloads: {
    take: (id: string): Promise<unknown> => ipcRenderer.invoke('downloads:take', id),
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
