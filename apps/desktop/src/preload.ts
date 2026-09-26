import { contextBridge, ipcRenderer } from 'electron';

/**
 * Мост между страницей настройки (setup.html) и main-процессом.
 * Самому дашборду он не нужен: это обычный сайт, загруженный с сервера.
 */
contextBridge.exposeInMainWorld('desktop', {
  getServerUrl: (): Promise<string | null> => ipcRenderer.invoke('settings:get-server-url'),
  saveServerUrl: (url: string): Promise<void> =>
    ipcRenderer.invoke('settings:save-server-url', url),
});
