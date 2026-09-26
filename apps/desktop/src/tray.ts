import { app, Menu, nativeImage, Tray } from 'electron';
import { join } from 'node:path';

export interface TrayActions {
  show: () => void;
  changeServer: () => void;
  quit: () => void;
}

/** Иконка в трее: приложение продолжает работать, когда окно закрыто. */
export function createTray(actions: TrayActions): Tray {
  const icon = nativeImage
    .createFromPath(join(__dirname, 'assets', 'icon.png'))
    .resize({ width: 16, height: 16 });
  const tray = new Tray(icon);
  tray.setToolTip('Personal Dashboard');

  const buildMenu = () =>
    Menu.buildFromTemplate([
      { label: 'Открыть', click: actions.show },
      { type: 'separator' },
      {
        label: 'Запускать вместе с системой',
        type: 'checkbox',
        checked: app.getLoginItemSettings().openAtLogin,
        click: (item) => {
          // --hidden: при автозапуске сразу сворачиваемся в трей, без окна.
          app.setLoginItemSettings({ openAtLogin: item.checked, args: ['--hidden'] });
        },
      },
      { label: 'Сменить адрес сервера…', click: actions.changeServer },
      { type: 'separator' },
      { label: 'Выход', click: actions.quit },
    ]);

  tray.setContextMenu(buildMenu());
  tray.on('double-click', actions.show);
  return tray;
}
