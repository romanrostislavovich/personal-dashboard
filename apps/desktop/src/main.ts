import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { join } from 'node:path';
import { loadSettings, saveSettings } from './settings-store';
import { createTray } from './tray';

/**
 * Desktop shell for the dashboard. The dashboard itself is the web app from the server;
 * the shell adds what a browser tab lacks:
 * a tray icon, start with the system and running "in the background".
 *
 * Server address: the DASHBOARD_URL variable (handy for development)
 * or the one saved in settings; if there is none, the connection screen is shown.
 */

let mainWindow: BrowserWindow | null = null;
let isQuitting = false;

const startHidden = process.argv.includes('--hidden');

if (!app.requestSingleInstanceLock()) {
  // Already running — the second instance just exits and the first one restores its window.
  app.quit();
} else {
  app.on('second-instance', showWindow);
  app.whenReady().then(bootstrap);
}

function bootstrap(): void {
  registerIpc();
  mainWindow = createWindow();
  createTray({ show: showWindow, changeServer: openSetup, quit: quitApp });
  openDashboard();
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 400,
    show: !startHidden,
    title: 'Personal Dashboard',
    icon: join(__dirname, 'assets', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
    },
  });

  // Closing the window hides it to the tray; quitting is done from the tray menu.
  window.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      window.hide();
    }
  });

  // External links (project sites, t.me/…) open in the system browser.
  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // The server is unreachable — suggest checking the address.
  window.webContents.on('did-fail-load', (_event, _code, _description, url, isMainFrame) => {
    if (isMainFrame && !url.startsWith('file:')) {
      openSetup(url);
    }
  });

  return window;
}

function openDashboard(): void {
  const serverUrl = process.env['DASHBOARD_URL'] ?? loadSettings().serverUrl;
  if (serverUrl) {
    mainWindow?.loadURL(serverUrl);
  } else {
    openSetup();
  }
}

function openSetup(failedUrl?: string): void {
  mainWindow?.loadFile(join(__dirname, 'assets', 'setup.html'), {
    query: failedUrl ? { error: failedUrl } : {},
  });
  showWindow();
}

function registerIpc(): void {
  ipcMain.handle('settings:get-server-url', () => loadSettings().serverUrl);
  ipcMain.handle('settings:save-server-url', (_event, url: string) => {
    saveSettings({ ...loadSettings(), serverUrl: url });
    openDashboard();
  });
}

function showWindow(): void {
  if (!mainWindow) {
    return;
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
}

function quitApp(): void {
  isQuitting = true;
  app.quit();
}

// The app lives in the tray, so closing all windows does not quit it.
app.on('window-all-closed', () => undefined);
