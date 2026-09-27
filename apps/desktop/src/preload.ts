import { contextBridge, ipcRenderer } from 'electron';

/**
 * Bridge between the setup page (setup.html) and the main process.
 * The dashboard itself does not need it: it is a regular website loaded from the server.
 */
contextBridge.exposeInMainWorld('desktop', {
  getServerUrl: (): Promise<string | null> => ipcRenderer.invoke('settings:get-server-url'),
  saveServerUrl: (url: string): Promise<void> =>
    ipcRenderer.invoke('settings:save-server-url', url),
});
