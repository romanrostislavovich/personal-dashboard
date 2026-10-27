import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Notification,
  OpenDialogOptions,
  shell,
} from 'electron';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { noticeText } from './activity/notices';
import { ActivityTracker, TrackerNotice } from './activity/tracker';
import { BackupStatus, listCopies, saveCopy } from './backup/backup-folder';
import {
  backupFolder,
  hasSmartBreakConsent,
  hasTelemetryConsent,
  installId,
  loadSettings,
  saveSettings,
  screenshotsFolder,
} from './settings-store';
import { ScreenshotFolder, screenshotName } from './screenshots/screenshot-folder';
import { DesktopWriting, Issue } from './writing/desktop-writing';
import { Capture } from './capture/capture';
import { DiskCleaner } from './disk/disk-cleaner';
import { DiskFix } from './disk/disk-fixes';
import { StatementWatch } from './downloads/statement-watch';
import { claimInstanceFile, isElevated, relaunchAsUser } from './single-instance';
import { createTray } from './tray';
import { ExtensionKeeper } from './update/extension-keeper';
import { AppUpdater, secureOrigin } from './update/updater';
import { DesktopWorkstates } from './workstates/desktop-workstates';
import { workstateMessages } from './workstates/messages';

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
const tracker: ActivityTracker = new ActivityTracker(
  serverUrl,
  () => refreshTray(),
  showNotice,
  () => hasTelemetryConsent(loadSettings(), serverUrl(), tracker.status().deviceId),
  undefined,
  () => hasSmartBreakConsent(loadSettings(), serverUrl(), tracker.status().deviceId),
);
const disk = new DiskCleaner();
const workstates = new DesktopWorkstates(tracker, serverUrl, () => {
  showWindow();
  mainWindow?.webContents.send('desktop:navigate', '/activity/workstates');
});
/** Ctrl+Alt+C / Ctrl+Alt+S from any program: text or a screenshot to a task or the diary. */
/** The folder of screenshots, synced with the server by the dashboard's page. */
const screenshots = new ScreenshotFolder(
  () => screenshotsFolder(loadSettings()),
  () => mainWindow?.webContents.send('screenshots:changed'),
);
/**
 * Writing in every program: the checks go through the dashboard's page (it holds the session),
 * asked by a message and answered with the same id; no answer in time — no marks.
 */
const pageRequests = new Map<number, (answer: unknown) => void>();
let pageRequestId = 0;
function askPage<T>(channel: string, payload: unknown): Promise<T | null> {
  const contents = mainWindow?.webContents;
  if (!contents) {
    return Promise.resolve(null);
  }
  const id = ++pageRequestId;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pageRequests.delete(id);
      resolve(null);
    }, 15_000);
    pageRequests.set(id, (answer) => {
      clearTimeout(timer);
      resolve(answer as T);
    });
    contents.send(channel, { id, payload });
  });
}
const writing = new DesktopWriting({
  check: (text) => askPage<Issue[]>('writing:check', text),
  ignore: async (what) => void (await askPage('writing:ignore', what)),
  accepted: async (count) => void (await askPage('writing:accepted', count)),
});

const capture = new Capture(
  serverUrl,
  (title, body) => notify(title, body, showWindow),
  async (png) => {
    await screenshots.ensure(loadSettings().screenshotsFolder === null);
    return screenshots.save(screenshotName(new Date()), png);
  },
);
/** A bank statement saved to Downloads: offered for import into Finance through the AI. */
const statements = new StatementWatch((statement) =>
  notify('Похоже на выписку банка', `${statement.name} — импортировать в Финансы?`, () => {
    showWindow();
    mainWindow?.webContents.send('desktop:navigate', `/ai?statement=${statement.id}`);
  }),
);
/** The project and note of the last focus session: "next round" goes on with them. */
let lastFocus: { projectId: string | null; note: string | null } = { projectId: null, note: null };
/** While a focus part or a break runs, the tray shows the minutes left. */
const TRAY_COUNTDOWN_MS = 30_000;
const updater = new AppUpdater(
  serverUrl,
  () => refreshTray(),
  () => installUpdateWhenOutOfSight(),
);
/** The browser extension's folder, updated from the server as the shell is. */
const extension = new ExtensionKeeper(serverUrl);

let startHidden = process.argv.includes('--hidden');

if (app.isPackaged && isElevated()) {
  // Never as administrator (single-instance.ts): again as the signed-in user, and this one goes.
  relaunchAsUser();
  app.quit();
} else if (!app.requestSingleInstanceLock() || !claimInstanceFile()) {
  // Already running — the second instance just exits and the first one restores its window.
  app.quit();
} else {
  app.on('second-instance', showWindow);
  app.whenReady().then(bootstrap);
}

function bootstrap(): void {
  startHidden = cameBackFromUpdate() || startHidden;
  // Run from the sources the shell is another app to Windows: for a notification Electron puts
  // an "Electron" shortcut into the Start menu, and under the installed app's id Windows would
  // take the name and the icon of the installed app from that shortcut.
  app.setAppUserModelId(app.isPackaged ? APP_ID : `${APP_ID}.dev`);
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
      checkedAt: () => updater.checkedAt,
      // The shell is one thing, the dashboard it shows another (the page's service worker
      // keeps its own copy): the button asks for both.
      check: () => {
        void updater.check();
        void extension.check();
        mainWindow?.webContents.send('desktop:check-update');
      },
      install: installUpdate,
    },
    activity: {
      status: () => tracker.status(),
      pause: (minutes) => tracker.pause(minutes),
    },
    focus: {
      status: () => tracker.focusStatus(),
      start: () => startFocus(lastFocus),
      stop: () => tracker.focus.stop(),
    },
    telemetry: {
      status: () => tracker.telemetryStatus(),
      set: (enabled) => {
        void setContextConsent('telemetry', enabled);
      },
    },
    smartBreak: {
      status: () => tracker.smartBreakStatus(),
      set: (enabled) => {
        void setContextConsent('smartBreak', enabled);
      },
    },
    workstates: {
      capture: () => {
        void workstates.capture();
      },
      chooseProject: () => {
        void workstates.choose('directory');
      },
      chooseIde: () => {
        void workstates.choose('exe');
      },
      clear: () => workstates.clear(),
    },
  });
  setInterval(() => {
    if (tracker.focus.status().phase !== 'idle') {
      refreshTray();
    }
  }, TRAY_COUNTDOWN_MS);
  tracker.start();
  statements.start();
  capture.register();
  void screenshots
    .ensure(loadSettings().screenshotsFolder === null)
    .then(() => screenshots.watch());
  updater.start();
  extension.start();
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
  ipcMain.handle('settings:save-server-url', (event, url: string) => {
    if (!trustedDashboard(event) && !trustedSetup(event)) return;
    try {
      const parsed = new URL(url);
      if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password)
        return;
    } catch {
      return;
    }
    contextRevision++;
    tracker.resetTelemetry();
    saveSettings({
      ...loadSettings(),
      serverUrl: url,
      telemetryConsent: null,
      smartBreakConsent: null,
      workstateContext: null,
    });
    openDashboard();
  });

  ipcMain.handle('telemetry:status', (event) =>
    trustedDashboard(event) ? tracker.telemetryStatus() : { enabled: false, available: false },
  );
  ipcMain.handle('telemetry:diagnostics', (event) =>
    trustedDashboard(event) ? tracker.telemetryDiagnostics(updater.fullVersion) : null,
  );
  ipcMain.handle('telemetry:set-consent', (event, enabled: unknown) =>
    trustedDashboard(event)
      ? setContextConsent('telemetry', enabled, () => trustedDashboard(event))
      : false,
  );
  ipcMain.handle('smart-break:status', (event) =>
    trustedDashboard(event) ? tracker.smartBreakStatus() : { enabled: false, available: false },
  );
  ipcMain.handle('smart-break:set-consent', (event, enabled: unknown) =>
    trustedDashboard(event)
      ? setContextConsent('smartBreak', enabled, () => trustedDashboard(event))
      : false,
  );
  ipcMain.handle('workstates:capture', (event) =>
    trustedDashboard(event) ? workstates.capture(() => trustedDashboard(event)) : false,
  );
  ipcMain.handle('workstates:resume', (event, plan: unknown) =>
    trustedDashboard(event)
      ? workstates.resume(plan, () => trustedDashboard(event))
      : { opened: 0, failed: 0, canceled: true },
  );

  // The Activity section of the dashboard switches the tracker of this computer on and off.
  ipcMain.handle('activity:status', () => tracker.status());
  ipcMain.handle('activity:enable', (event, device: { id: string; token: string }) => {
    if (
      !trustedDashboard(event) ||
      !device ||
      typeof device.id !== 'string' ||
      typeof device.token !== 'string' ||
      !device.id ||
      !device.token
    )
      return;
    contextRevision++;
    saveSettings({
      ...loadSettings(),
      telemetryConsent: null,
      smartBreakConsent: null,
      workstateContext: null,
    });
    tracker.enable(device);
  });
  ipcMain.handle('activity:disable', (event) => {
    if (!trustedDashboard(event)) return;
    contextRevision++;
    tracker.disable();
    saveSettings({
      ...loadSettings(),
      telemetryConsent: null,
      smartBreakConsent: null,
      workstateContext: null,
    });
  });
  ipcMain.handle('activity:pause', (_event, minutes: number | null) => tracker.pause(minutes));
  ipcMain.handle('focus:status', () => tracker.focusStatus());
  ipcMain.handle(
    'focus:start',
    (_event, options: { projectId?: string | null; note?: string | null } = {}) =>
      startFocus({ projectId: options.projectId ?? null, note: options.note ?? null }),
  );
  ipcMain.handle('focus:stop', () => tracker.focus.stop());
  ipcMain.handle('disk:status', () => disk.current());
  ipcMain.handle('disk:scan', (_event, mount: string) => disk.scan(mount));
  ipcMain.handle('disk:trash', (_event, paths: string[]) =>
    disk.trash(Array.isArray(paths) ? paths.filter((path) => typeof path === 'string') : []),
  );
  ipcMain.handle('disk:open-recycle-bin', () => disk.openRecycleBin());
  ipcMain.handle('disk:empty-recycle-bin', () => disk.emptyRecycleBin());
  ipcMain.handle('disk:fix', (_event, fix: DiskFix) => disk.fix(fix));
  ipcMain.handle('disk:reveal', (_event, path: string) => disk.reveal(String(path)));
  ipcMain.handle('capture:pending', () => capture.current());
  ipcMain.handle('capture:close', () => capture.close());
  ipcMain.handle('region:image', () => capture.overlayImage());
  ipcMain.handle('annotate:image', () => capture.editorImage());
  ipcMain.handle('annotate:done', (_event, data: Uint8Array, action: string) =>
    data instanceof Uint8Array && ['save', 'actions', 'copy'].includes(action)
      ? capture.editorDone(Buffer.from(data), action as 'save' | 'actions' | 'copy')
      : undefined,
  );
  ipcMain.handle('annotate:cancel', () => capture.editorCancelled());
  registerScreenshotsIpc();
  ipcMain.handle('device:front-window', () => tracker.frontWindow());
  ipcMain.on('writing:answer', (_event, answer: { id: number; value: unknown }) => {
    pageRequests.get(answer?.id)?.(answer.value);
    pageRequests.delete(answer?.id);
  });
  ipcMain.handle(
    'writing:configure',
    (_event, config: { enabled?: unknown; ignoredApps?: unknown }) =>
      writing.configure({
        enabled: config?.enabled === true,
        ignoredApps: Array.isArray(config?.ignoredApps)
          ? config.ignoredApps.filter((app): app is string => typeof app === 'string')
          : [],
      }),
  );
  ipcMain.handle(
    'region:done',
    (_event, rect: { x: number; y: number; width: number; height: number } | null) =>
      capture.regionDone(
        rect && [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) ? rect : null,
      ),
  );
  ipcMain.handle('downloads:take', async (_event, id: string) => {
    const statement = statements.get(String(id));
    if (!statement) {
      return null;
    }
    // Only a file the watch found and the user clicked on reaches the page.
    const content = await readFile(statement.path).catch(() => null);
    return content ? { name: statement.name, base64: content.toString('base64') } : null;
  });
  // The copies of one's data: the page fetches the archive, the shell keeps it in a folder.
  // Settings → Apps: this computer in the list of devices, and the extension's folder.
  ipcMain.handle('apps:info', () => ({
    installId: installId(),
    version: updater.fullVersion,
    extension: extension.status(),
  }));
  ipcMain.handle('apps:open-extension-folder', async () => {
    await extension.check();
    await mkdir(extension.folder, { recursive: true });
    await shell.openPath(extension.folder);
  });
  ipcMain.handle('backup:status', () => backupStatus());
  ipcMain.handle('backup:save', async (_event, name: string, data: Uint8Array) => {
    const settings = loadSettings();
    await saveCopy(backupFolder(settings), String(name), new Uint8Array(data), settings.backupKeep);
    return backupStatus();
  });
  ipcMain.handle('backup:open-folder', async () => {
    const folder = backupFolder(loadSettings());
    await mkdir(folder, { recursive: true });
    await shell.openPath(folder);
  });
  ipcMain.handle('backup:choose-folder', async () => {
    const settings = loadSettings();
    const options: OpenDialogOptions = {
      defaultPath: backupFolder(settings),
      properties: ['openDirectory', 'createDirectory'],
    };
    const picked = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options);
    if (!picked.canceled && picked.filePaths[0]) {
      saveSettings({ ...settings, backupFolder: picked.filePaths[0] });
    }
    return backupStatus();
  });
  ipcMain.handle('backup:keep', (_event, keep: number) => {
    if (Number.isInteger(keep) && keep >= 1 && keep <= 365) {
      saveSettings({ ...loadSettings(), backupKeep: keep });
    }
    return backupStatus();
  });
  ipcMain.handle('disk:keep-advice', (_event, advice: unknown) => disk.keepAdvice(advice));
  ipcMain.handle('disk:dismiss', () => disk.dismiss());

  // The dashboard asks for a system notification; a click opens the window on the given page.
  ipcMain.on(
    'desktop:notify',
    (_event, { title, body, route }: { title: string; body: string; route?: string }) => {
      // A focus part is quiet: the notification waits, and its end says how many there were.
      if (tracker.focus.working) {
        tracker.focus.hold();
        return;
      }
      // A call is going on: the notification waits too.
      if (tracker.inMeeting) {
        tracker.holdDuringMeeting();
        return;
      }
      notify(title, body, () => {
        showWindow();
        if (route) {
          mainWindow?.webContents.send('desktop:navigate', route);
        }
      });
    },
  );
}

function trustedDashboard(event: Electron.IpcMainInvokeEvent): boolean {
  const server = serverUrl();
  try {
    return (
      !!server &&
      !!mainWindow &&
      event.sender === mainWindow.webContents &&
      event.senderFrame === mainWindow.webContents.mainFrame &&
      ['https:', 'http:'].includes(new URL(event.senderFrame.url).protocol) &&
      // An address saved as http:// opens on https:// after the server's redirect: the page is
      // still the dashboard, only on the secure origin.
      [new URL(server).origin, secureOrigin(server)].includes(new URL(event.senderFrame.url).origin)
    );
  } catch {
    return false;
  }
}

function trustedSetup(event: Electron.IpcMainInvokeEvent): boolean {
  try {
    const url = new URL(event.senderFrame?.url ?? '');
    return (
      !!mainWindow &&
      event.sender === mainWindow.webContents &&
      event.senderFrame === mainWindow.webContents.mainFrame &&
      url.protocol === 'file:' &&
      fileURLToPath(url).toLowerCase() === join(__dirname, 'assets', 'setup.html').toLowerCase()
    );
  } catch {
    return false;
  }
}

let consentBusy = false;
let contextRevision = 0;
async function setContextConsent(
  kind: 'telemetry' | 'smartBreak',
  enabled: unknown,
  trusted: () => boolean = () => true,
): Promise<boolean> {
  if (typeof enabled !== 'boolean' || !trusted()) return false;
  if (!enabled) {
    contextRevision++;
    if (kind === 'telemetry') tracker.resetTelemetry();
    else tracker.resetSmartBreak();
    saveSettings({
      ...loadSettings(),
      [kind === 'telemetry' ? 'telemetryConsent' : 'smartBreakConsent']: null,
    });
    refreshTray();
    return true;
  }
  if (consentBusy) return false;
  const revision = contextRevision;
  const server = serverUrl();
  const deviceId = tracker.status().deviceId;
  const status = kind === 'telemetry' ? tracker.telemetryStatus() : tracker.smartBreakStatus();
  if (enabled && (!server || !deviceId || !status.available)) return false;
  consentBusy = true;
  try {
    if (enabled && !status.enabled) {
      const messages = workstateMessages(app.getLocale());
      const question: Electron.MessageBoxOptions = {
        type: 'question',
        message: kind === 'telemetry' ? messages.telemetryConsent : messages.smartBreakConsent,
        detail: `${messages.server}: ${server}`,
        buttons: [messages.cancel, messages.allow],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      };
      // Without a parent the question can open behind the dashboard's window: the switch then
      // seems to do nothing while it waits for an answer nobody sees.
      const parent =
        mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible() ? mainWindow : null;
      const result = await (parent
        ? dialog.showMessageBox(parent, question)
        : dialog.showMessageBox(question));
      if (result.response !== 1) return false;
    }
    if (
      !trusted() ||
      revision !== contextRevision ||
      server !== serverUrl() ||
      deviceId !== tracker.status().deviceId
    )
      return false;
    contextRevision++;
    if (kind === 'telemetry') tracker.resetTelemetry();
    else tracker.resetSmartBreak();
    saveSettings({
      ...loadSettings(),
      [kind === 'telemetry' ? 'telemetryConsent' : 'smartBreakConsent']:
        enabled && server && deviceId ? { serverUrl: server, deviceId } : null,
    });
    return true;
  } catch {
    return false;
  } finally {
    consentBusy = false;
    refreshTray();
  }
}

function notify(title: string, body: string, onClick: () => void): void {
  if (!Notification.isSupported()) {
    return;
  }
  const notification = new Notification({
    title,
    body,
    icon: join(__dirname, 'assets', 'icon.png'),
  });
  notification.on('click', onClick);
  notification.show();
}

/** What the tracker has to say: a break is due, a focus part or a break has ended. */
function showNotice(notice: TrackerNotice): void {
  const { title, body } = noticeText(notice, app.getLocale());
  notify(title, body, () => (notice.kind === 'break-ended' ? startFocus(lastFocus) : showWindow()));
  refreshTray();
}

function startFocus(options: { projectId: string | null; note: string | null }): void {
  lastFocus = options;
  tracker.startFocus(options);
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

app.on('will-quit', () => {
  capture.unregister();
  writing.stop();
});

// The app lives in the tray, so closing all windows does not quit it.
app.on('window-all-closed', () => undefined);

/** The folder of the copies and what is in it. */
/** The folder of screenshots for the dashboard's page, which syncs it with the server. */
function registerScreenshotsIpc(): void {
  const status = () => ({ folder: screenshotsFolder(loadSettings()) });
  const name = (value: unknown) => String(value);
  ipcMain.handle('screenshots:status', status);
  ipcMain.handle('screenshots:list', () => screenshots.list());
  ipcMain.handle('screenshots:read', (_event, file: unknown) => screenshots.read(name(file)));
  ipcMain.handle('screenshots:write', (_event, file: unknown, data: unknown) =>
    data instanceof Uint8Array ? screenshots.write(name(file), data) : undefined,
  );
  ipcMain.handle('screenshots:remove', (_event, file: unknown) => screenshots.remove(name(file)));
  ipcMain.handle('screenshots:rename', (_event, from: unknown, to: unknown) =>
    screenshots.rename(name(from), name(to)),
  );
  ipcMain.handle('screenshots:open-folder', async () => {
    const folder = screenshotsFolder(loadSettings());
    await mkdir(folder, { recursive: true });
    await shell.openPath(folder);
  });
  ipcMain.handle('screenshots:choose-folder', async () => {
    const options = {
      title: 'Папка для скриншотов',
      defaultPath: screenshotsFolder(loadSettings()),
      properties: ['openDirectory' as const, 'createDirectory' as const],
    };
    const picked = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options);
    if (!picked.canceled && picked.filePaths[0]) {
      saveSettings({ ...loadSettings(), screenshotsFolder: picked.filePaths[0] });
      screenshots.watch();
    }
    return status();
  });
}

async function backupStatus(): Promise<BackupStatus> {
  const settings = loadSettings();
  const folder = backupFolder(settings);
  return { folder, keep: settings.backupKeep, copies: await listCopies(folder) };
}
