import { app, Menu, MenuItemConstructorOptions, nativeImage, Tray } from 'electron';
import { join } from 'node:path';
import { FocusStatus } from './activity/focus-timer';
import { TrackerStatus } from './activity/tracker';
import { UpdateState } from './update/updater';

export interface TrayActions {
  show: () => void;
  changeServer: () => void;
  quit: () => void;
  startWithSystem: {
    enabled: () => boolean;
    set: (enabled: boolean) => void;
  };
  update: {
    state: () => UpdateState;
    /** The code that is running. */
    version: () => string;
    check: () => void;
    /** Restarts into the downloaded update. */
    install: () => void;
  };
  focus: {
    status: () => FocusStatus & { available: boolean };
    start: () => void;
    /** Stops a focus part or skips a break. */
    stop: () => void;
  };
  activity: {
    status: () => TrackerStatus;
    /** `minutes` — pause for so long; `0` — until resumed; `null` — resume. */
    pause: (minutes: number | null) => void;
  };
}

/**
 * Tray icon: the app keeps running when the window is closed. Returns a function that rebuilds
 * the menu — the tracker and the updater call it when their status changes.
 */
export function createTray(actions: TrayActions): () => void {
  const icon = nativeImage
    .createFromPath(join(__dirname, 'assets', 'icon.png'))
    .resize({ width: 16, height: 16 });
  const tray = new Tray(icon);

  const refresh = () => {
    const status = actions.activity.status();
    const focus = actions.focus.status();
    tray.setToolTip(
      focus.phase === 'focus'
        ? 'Personal Dashboard — идёт фокус'
        : status.deviceId && !status.paused
          ? 'Personal Dashboard — активность записывается'
          : 'Personal Dashboard',
    );
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Открыть', click: actions.show },
        { type: 'separator' },
        ...activityItems(status, actions.activity.pause),
        ...focusItems(actions.focus),
        { type: 'separator' },
        {
          label: 'Запускать вместе с системой',
          type: 'checkbox',
          checked: actions.startWithSystem.enabled(),
          click: (item) => actions.startWithSystem.set(item.checked),
        },
        { label: 'Сменить адрес сервера…', click: actions.changeServer },
        { type: 'separator' },
        ...updateItems(actions.update),
        { type: 'separator' },
        { label: 'Выход', click: actions.quit },
      ]),
    );
  };

  refresh();
  tray.on('double-click', actions.show);
  return refresh;
}

/** The version of the shell and what its updater is doing. */
function updateItems(update: TrayActions['update']): MenuItemConstructorOptions[] {
  const version: MenuItemConstructorOptions = {
    label: `Версия ${app.getVersion()} (${update.version()})`,
    enabled: false,
  };
  const state = update.state();
  switch (state.kind) {
    case 'off':
      return [version];
    case 'ready':
      return [
        version,
        { label: `Обновление ${state.version} готово — перезапустить`, click: update.install },
      ];
    case 'checking':
      return [version, { label: 'Проверка обновлений…', enabled: false }];
    case 'reinstall':
      return [
        version,
        { label: 'Новая версия требует переустановки приложения', enabled: false },
        { label: 'Проверить ещё раз', click: update.check },
      ];
    case 'error':
      return [
        version,
        { label: 'Обновления: сервер не ответил', enabled: false },
        { label: 'Проверить ещё раз', click: update.check },
      ];
    case 'idle':
      return [version, { label: 'Проверить обновления', click: update.check }];
  }
}

/** The focus timer: start a session, or the minutes left and a way to stop. */
function focusItems(focus: TrayActions['focus']): MenuItemConstructorOptions[] {
  const status = focus.status();
  if (!status.available) {
    return [];
  }
  const left = status.endsAt
    ? Math.max(1, Math.ceil((Date.parse(status.endsAt) - Date.now()) / 60_000))
    : 0;
  switch (status.phase) {
    case 'focus':
      return [
        { label: `Фокус: осталось ${left} мин`, enabled: false },
        { label: 'Остановить фокус', click: focus.stop },
      ];
    case 'short-break':
    case 'long-break':
      return [
        { label: `Перерыв: осталось ${left} мин`, enabled: false },
        { label: 'Пропустить перерыв', click: focus.stop },
      ];
    case 'idle':
      return [{ label: 'Начать фокус', click: focus.start }];
  }
}

/** The tracker in the tray menu: what it is doing and a way to pause it. */
function activityItems(
  status: TrackerStatus,
  pause: (minutes: number | null) => void,
): MenuItemConstructorOptions[] {
  if (!status.supported) {
    return [{ label: 'Активность: не поддерживается в этой системе', enabled: false }];
  }
  if (!status.deviceId) {
    return [{ label: 'Активность: включи в разделе «Активность»', enabled: false }];
  }
  if (status.paused) {
    return [
      { label: 'Активность: на паузе', enabled: false },
      { label: 'Возобновить запись', click: () => pause(null) },
    ];
  }
  return [
    { label: 'Активность: записывается', enabled: false },
    {
      label: 'Пауза',
      submenu: [
        { label: 'На 15 минут', click: () => pause(15) },
        { label: 'На час', click: () => pause(60) },
        { label: 'До возобновления', click: () => pause(0) },
      ],
    },
  ];
}
