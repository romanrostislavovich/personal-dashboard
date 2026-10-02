import { app, BrowserWindow, ipcMain, Notification, shell } from 'electron';
import { join } from 'node:path';
import { ActivityTracker } from './activity/tracker';
import { loadSettings, saveSettings } from './settings-store';
import { createTray } from './tray';
import { AppUpdater } from './update/updater';

/**
 * Desktop shell for the dashboard. The dashboard itself is the web app from the server;
 * the shell adds what a browser tab lacks:
 * a tray icon, start with the system, running "in the background", system notifications,
 * the activity tracker (./activity): which program is in front and for how long, and updates
 * of the shell itself (./update): this file is the start of the bundle the loader runs.
 *
 * Server address: the DASHBOARD_URL variable (handy for development)
 * or the one saved in settings; if there is none, the connection screen is shown.
 */

/** The same id as in electron-builder.yml; Windows needs it to show notifications. */
const APP_ID = 'com.romanrostislavovich.personal-dashboard';

let mainWindow: BrowserWindow | null = null;
let isQuitting = false;
/** Rebuilds the tray menu: the tracker's status is a part of it. */
let refreshTray: () => void = () => undefined;

const serverUrl = (): string | null => process.env['DASHBOARD_URL'] ?? loadSettings().serverUrl;
const tracker = new ActivityTracker(serverUrl, () => refreshTray());
const updater = new AppUpdater(
  serverUrl,
  () => refreshTray(),
  () => installUpdateWhenOutOfSight(),
);

let startHidden = process.argv.includes('--hidden');

if (!app.requestSingleInstanceLock()) {
  // Already running — the second instance just exits and the first one restores its window.
  app.quit();
} else {
  app.on('second-instance', showWindow);
  app.whenReady().then(bootstrap);
}

function bootstrap(): void {
  startHidden = cameBackFromUpdate() || startHidden;
  app.setAppUserModelId(APP_ID);
  registerIpc();
  applyStartWithSystem(loadSettings().startWithSystem);
  mainWindow = createWindow();
  refreshTray = createTray({
    show: showWindow,
    changeServer: openSetup,
    quit: quitApp,
    startWithSystem: {
      enabled: () => loadSettings().startWithSystem,
      set: (enabled) => {
        saveSettings({ ...loadSettings(), startWithSystem: enabled });
        applyStartWithSystem(enabled);
      },
    },
    update: {
      state: () => updater.state,
      version: () => updater.version,
      check: () => void updater.check(),
      install: installUpdate,
    },
    activity: {
      status: () => tracker.status(),
      pause: (minutes) => tracker.pause(minutes),
    },
  });
  tracker.start();
  updater.start();
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
      installUpdateWhenOutOfSight();
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

/**
 * The app is meant to run all the time (the tracker, notifications), so it starts with the
 * system unless the user switched that off in the tray. Told to the system on every start:
 * it remembers the path of the program, which a reinstall may change.
 */
function applyStartWithSystem(enabled: boolean): void {
  if (app.isPackaged) {
    // --hidden: on autostart go straight to the tray, without a window.
    app.setLoginItemSettings({ openAtLogin: enabled, args: ['--hidden'] });
  }
}

/** The previous run ended to install an update: this one starts in the tray, once. */
function cameBackFromUpdate(): boolean {
  const settings = loadSettings();
  if (!settings.startHiddenOnce) {
    return false;
  }
  saveSettings({ ...settings, startHiddenOnce: false });
  return true;
}

/**
 * A downloaded update is switched to without getting in the way: at once while the window is
 * in the tray, otherwise when it is closed there. A quit does it too — the next start runs
 * the new code.
 */
function installUpdateWhenOutOfSight(): void {
  if (updater.state.kind === 'ready' && !mainWindow?.isVisible()) {
    installUpdate();
  }
}

/** Restarts into the downloaded update; what the tracker has recorded is sent first. */
function installUpdate(): void {
  if (updater.state.kind !== 'ready') {
    return;
  }
  // A window that was open stays open in the new version; one in the tray stays there.
  saveSettings({ ...loadSettings(), startHiddenOnce: !mainWindow?.isVisible() });
  isQuitting = true;
  void Promise.race([tracker.stop(), new Promise((resolve) => setTimeout(resolve, 3000))]).then(
    () => {
      app.relaunch();
      app.quit();
    },
  );
}

function openDashboard(): void {
  const url = serverUrl();
  if (url) {
    mainWindow?.loadURL(url);
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

  // The Activity section of the dashboard switches the tracker of this computer on and off.
  ipcMain.handle('activity:status', () => tracker.status());
  ipcMain.handle('activity:enable', (_event, device: { id: string; token: string }) =>
    tracker.enable(device),
  );
  ipcMain.handle('activity:disable', () => tracker.disable());
  ipcMain.handle('activity:pause', (_event, minutes: number | null) => tracker.pause(minutes));

  // The dashboard asks for a system notification; a click opens the window on the given page.
  ipcMain.on(
    'desktop:notify',
    (_event, { title, body, route }: { title: string; body: string; route?: string }) => {
      if (!Notification.isSupported()) {
        return;
      }
      const notification = new Notification({
        title,
        body,
        icon: join(__dirname, 'assets', 'icon.png'),
      });
      notification.on('click', () => {
        showWindow();
        if (route) {
          mainWindow?.webContents.send('desktop:navigate', route);
        }
      });
      notification.show();
    },
  );
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
  // What the tracker has recorded is sent before the app goes; a slow server is not waited for.
  void Promise.race([tracker.stop(), new Promise((resolve) => setTimeout(resolve, 3000))]).then(
    () => app.quit(),
  );
}

// The app lives in the tray, so closing all windows does not quit it.
app.on('window-all-closed', () => undefined);
