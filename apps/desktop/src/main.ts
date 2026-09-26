import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { join } from 'node:path';
import { loadSettings, saveSettings } from './settings-store';
import { createTray } from './tray';

/**
 * Desktop-оболочка дашборда. Сам дашборд — это web-приложение с сервера,
 * а оболочка добавляет то, чего нет у вкладки браузера:
 * иконку в трее, автозапуск вместе с системой и работу «в фоне».
 *
 * Адрес сервера: переменная DASHBOARD_URL (удобно для разработки)
 * или сохранённый в настройках; если его нет — показываем экран подключения.
 */

let mainWindow: BrowserWindow | null = null;
let isQuitting = false;

const startHidden = process.argv.includes('--hidden');

if (!app.requestSingleInstanceLock()) {
  // Уже запущено — второй экземпляр просто выходит, а первый разворачивает окно.
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

  // Закрытие окна прячет его в трей; выход — через меню трея.
  window.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      window.hide();
    }
  });

  // Внешние ссылки (сайты проектов, t.me/…) открываем в системном браузере.
  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Сервер недоступен — предлагаем проверить адрес.
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

// Приложение живёт в трее, поэтому закрытие всех окон не завершает его.
app.on('window-all-closed', () => undefined);
