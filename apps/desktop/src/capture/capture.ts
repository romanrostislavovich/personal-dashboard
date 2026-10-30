import {
  BrowserWindow,
  clipboard,
  desktopCapturer,
  globalShortcut,
  ClipboardItem,
  NativeImage,
  screen,
} from 'electron';
import {join} from 'node:path';

export type Captured =
  {kind: 'text'; text: string} | {kind: 'image'; base64: string};

/** Ctrl+Alt+C — the copied text; Ctrl+Alt+S — a piece of the screen. */
const TEXT_SHORTCUT = 'Control+Alt+C';
const SCREEN_SHORTCUT = 'Control+Alt+S';

/**
 * Captures from anywhere: a shortcut takes the copied text, or lets the user draw a rectangle
 * over a picture of the screen, and opens a small window of the dashboard (`/capture`) where
 * the modules offer what to do with it — a task, a diary note, a photo for the diary.
 */
export class Capture {
  private pending: Captured | null = null;
  private window: BrowserWindow | null = null;
  private overlay: BrowserWindow | null = null;
  private screenshot: {image: NativeImage; scale: number} | null = null;
  /** The piece of the screen in the editor (assets/annotate.html). */
  private editor: BrowserWindow | null = null;
  private piece: NativeImage | null = null;

  constructor(
    private readonly serverUrl: () => string | null,
    private readonly notify: (title: string, body: string) => void,
    /** Keeps a finished screenshot in the folder of screenshots; returns where it went. */
    private readonly keep: (png: Buffer) => Promise<string>,
  ) {}

  /** Taken shortcuts (another program has them) are told about once. */
  register(): void {
    const taken = [
      [TEXT_SHORTCUT, () => void this.captureText()],
      [SCREEN_SHORTCUT, () => void this.captureScreen()],
    ].filter(
      ([keys, handler]) =>
        !globalShortcut.register(keys as string, handler as () => void),
    );
    if (taken.length) {
      this.notify(
        'Сочетание клавиш занято',
        `${taken.map(([keys]) => keys).join(', ')} уже использует другая программа.`,
      );
    }
  }

  unregister(): void {
    globalShortcut.unregisterAll();
  }

  /** For the capture page: what to show. */
  current(): Captured | null {
    return this.pending;
  }

  close(): void {
    this.window?.close();
  }

  /** For the overlay: the picture of the screen to draw on. */
  overlayImage(): string | null {
    return this.screenshot?.image.toDataURL() ?? null;
  }

  /** The overlay is done: a rectangle in its own (CSS) pixels, or `null` — cancelled. */
  regionDone(
    rect: {x: number; y: number; width: number; height: number} | null,
  ): void {
    const shot = this.screenshot;
    this.overlay?.close();
    this.overlay = null;
    this.screenshot = null;
    if (!shot || !rect || rect.width < 4 || rect.height < 4) {
      return;
    }
    const piece = shot.image.crop({
      x: Math.round(rect.x * shot.scale),
      y: Math.round(rect.y * shot.scale),
      width: Math.round(rect.width * shot.scale),
      height: Math.round(rect.height * shot.scale),
    });
    void this.openEditor(piece, shot.scale);
  }

  /** For the editor: the piece to draw on. */
  editorImage(): string | null {
    return this.piece?.toDataURL() ?? null;
  }

  /**
   * The editor is done. `save` and `copy` — into the folder (synced with the server) and the
   * clipboard: a copied screenshot is kept too, so it is never lost with the next copy;
   * `actions` — the same, then the window that makes it a task or a diary photo.
   */
  async editorDone(
    png: Buffer,
    action: 'save' | 'actions' | 'copy',
  ): Promise<void> {
    // The clipboard of Electron follows the browser's: a PNG goes in as an item.
    await clipboard.write([
      new ClipboardItem({
        'image/png': new Blob([new Uint8Array(png)], {type: 'image/png'}),
      }),
    ]);
    this.editor?.close();
    try {
      await this.keep(png);
    } catch (error) {
      this.notify(
        'Скриншот не сохранён',
        error instanceof Error ? error.message : String(error),
      );
    }
    if (action === 'actions') {
      this.open({kind: 'image', base64: png.toString('base64')});
    }
  }

  editorCancelled(): void {
    this.editor?.close();
  }

  /** A window the size of the piece (within the screen), with the tools on top. */
  private async openEditor(piece: NativeImage, scale: number): Promise<void> {
    this.editor?.close();
    this.piece = piece;
    const area = screen.getDisplayNearestPoint(
      screen.getCursorScreenPoint(),
    ).workAreaSize;
    const {width, height} = piece.getSize();
    this.editor = new BrowserWindow({
      width: Math.min(
        area.width,
        Math.max(720, Math.round(width / scale) + 40),
      ),
      height: Math.min(
        area.height,
        Math.max(420, Math.round(height / scale) + 110),
      ),
      alwaysOnTop: true,
      autoHideMenuBar: true,
      title: 'Скриншот — Personal Dashboard',
      icon: join(__dirname, 'assets', 'icon.png'),
      webPreferences: {
        preload: join(__dirname, 'preload.js'),
        contextIsolation: true,
        sandbox: true,
      },
    });
    this.editor.on('closed', () => {
      this.editor = null;
      this.piece = null;
    });
    await this.editor.loadFile(join(__dirname, 'assets', 'annotate.html'));
    this.editor.focus();
  }

  private async captureText(): Promise<void> {
    const text = (await clipboard.readText()).trim();
    if (!text) {
      this.notify(
        'Буфер обмена пуст',
        'Скопируйте текст и нажмите Ctrl+Alt+C ещё раз.',
      );
      return;
    }
    this.open({kind: 'text', text: text.slice(0, 5000)});
  }

  /** A picture of the screen under the mouse, shown full-screen to draw the rectangle on. */
  private async captureScreen(): Promise<void> {
    if (this.overlay) {
      return;
    }
    const display = screen.getDisplayNearestPoint(
      screen.getCursorScreenPoint(),
    );
    const size = {
      width: Math.round(display.size.width * display.scaleFactor),
      height: Math.round(display.size.height * display.scaleFactor),
    };
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: size,
    });
    const source =
      sources.find(item => item.display_id === String(display.id)) ??
      sources[0];
    if (!source) {
      return;
    }
    const image = source.thumbnail;
    this.screenshot = {
      image,
      scale: image.getSize().width / display.bounds.width,
    };
    this.overlay = new BrowserWindow({
      ...display.bounds,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      show: false,
      webPreferences: {
        preload: join(__dirname, 'preload.js'),
        contextIsolation: true,
        sandbox: true,
      },
    });
    this.overlay.setAlwaysOnTop(true, 'screen-saver');
    this.overlay.once('ready-to-show', () => {
      this.overlay?.show();
      this.overlay?.focus();
    });
    this.overlay.on('closed', () => {
      this.overlay = null;
      this.screenshot = null;
    });
    await this.overlay.loadFile(join(__dirname, 'assets', 'region.html'));
  }

  private open(captured: Captured): void {
    const server = this.serverUrl();
    if (!server) {
      return;
    }
    this.pending = captured;
    if (this.window) {
      this.window.webContents.reload();
      this.window.show();
      this.window.focus();
      return;
    }
    this.window = new BrowserWindow({
      width: 520,
      height: 460,
      alwaysOnTop: true,
      autoHideMenuBar: true,
      title: 'Захват — Personal Dashboard',
      icon: join(__dirname, 'assets', 'icon.png'),
      webPreferences: {
        preload: join(__dirname, 'preload.js'),
        contextIsolation: true,
        sandbox: true,
      },
    });
    this.window.on('closed', () => {
      this.window = null;
      this.pending = null;
    });
    void this.window.loadURL(new URL('/capture', server).href);
  }
}
