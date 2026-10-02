import { app, Menu, MenuItemConstructorOptions, nativeImage, Tray } from 'electron';
import { join } from 'node:path';
import { TrackerStatus } from './activity/tracker';

export interface TrayActions {
  show: () => void;
  changeServer: () => void;
  quit: () => void;
  activity: {
    status: () => TrackerStatus;
    /** `minutes` — pause for so long; `0` — until resumed; `null` — resume. */
    pause: (minutes: number | null) => void;
  };
}

/**
 * Tray icon: the app keeps running when the window is closed. Returns a function that rebuilds
 * the menu — the tracker calls it when its status changes.
 */
export function createTray(actions: TrayActions): () => void {
  const icon = nativeImage
    .createFromPath(join(__dirname, 'assets', 'icon.png'))
    .resize({ width: 16, height: 16 });
  const tray = new Tray(icon);

  const refresh = () => {
    const status = actions.activity.status();
    tray.setToolTip(
      status.deviceId && !status.paused
        ? 'Personal Dashboard — активность записывается'
        : 'Personal Dashboard',
    );
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Открыть', click: actions.show },
        { type: 'separator' },
        ...activityItems(status, actions.activity.pause),
        { type: 'separator' },
        {
          label: 'Запускать вместе с системой',
          type: 'checkbox',
          checked: app.getLoginItemSettings().openAtLogin,
          click: (item) => {
            // --hidden: on autostart go straight to the tray, without a window.
            app.setLoginItemSettings({ openAtLogin: item.checked, args: ['--hidden'] });
          },
        },
        { label: 'Сменить адрес сервера…', click: actions.changeServer },
        { type: 'separator' },
        { label: 'Выход', click: actions.quit },
      ]),
    );
  };

  refresh();
  tray.on('double-click', actions.show);
  return refresh;
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
