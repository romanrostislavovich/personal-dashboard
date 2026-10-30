import {BrowserWindow, ipcMain, screen} from 'electron';
import {join} from 'node:path';
import {FieldEvent, FieldWatch, ScreenBox} from './field-watch';

/** A mistake as the dashboard tells it (WritingIssue of the contracts). */
export interface Issue {
  offset: number;
  length: number;
  kind:
    'spelling' | 'grammar' | 'punctuation' | 'style' | 'typography' | 'other';
  message: string;
  replacements: string[];
  ruleId: string;
}

/** What the dashboard's page does for the app: it holds the session (see WritingBridge). */
export interface WritingServer {
  check(text: string): Promise<Issue[] | null>;
  ignore(what: {word?: string; ruleId?: string}): Promise<void>;
  /** A suggested fix was taken: counted for the achievements (not the text). */
  accepted(count: number): Promise<void>;
}

export interface WritingConfig {
  enabled: boolean;
  /** Process names, lower case. */
  ignoredApps: string[];
}

/** A pause in typing this long and the text is checked. */
const CHECK_AFTER_MS = 900;
/** The marks follow a field that scrolls or moves this often. */
const FOLLOW_MS = 1200;
const MIN_LENGTH = 3;
/** Browsers have the extension, the dashboard checks itself: two sets of marks would clash. */
const LEFT_TO_OTHERS = new Set([
  'chrome',
  'msedge',
  'firefox',
  'brave',
  'opera',
  'vivaldi',
  'browser',
  'arc',
  'personal dashboard',
  'electron',
]);
const COLOURS: Record<Issue['kind'], string> = {
  spelling: '#e53935',
  grammar: '#f9a825',
  punctuation: '#fb8c00',
  style: '#3f51b5',
  typography: '#9e9e9e',
  other: '#9e9e9e',
};
const CARD_WIDTH = 340;

/**
 * Writing in every program, as Grammarly does: the field the user types in is read through
 * UI Automation, checked by the dashboard after a pause, and its mistakes are underlined in a
 * transparent window over the screen that lets every click through. When the caret is in a
 * marked word, its card opens beside it — a window that never takes the focus — and a fix is
 * typed into the field. Programs that give no positions of their words get no marks.
 */
export class DesktopWriting {
  private readonly watch = new FieldWatch(event => this.onEvent(event));
  private config: WritingConfig = {enabled: false, ignoredApps: []};
  private field: {app: string; text: string} | null = null;
  private issues: Issue[] = [];
  private rects: ScreenBox[][] = [];
  private timer: NodeJS.Timeout | null = null;
  private follow: NodeJS.Timeout | null = null;
  private checkNumber = 0;
  private overlay: BrowserWindow | null = null;
  private card: BrowserWindow | null = null;
  private cardIssue: Issue | null = null;

  constructor(private readonly server: WritingServer) {
    ipcMain.handle(
      'writing-card:choose',
      (_event, choice: {action: string; value?: string}) =>
        this.onChoice(choice),
    );
    ipcMain.handle('writing-card:height', (_event, height: number) => {
      if (this.card && Number.isFinite(height)) {
        const bounds = this.card.getBounds();
        this.card.setBounds({
          ...bounds,
          height: Math.min(400, Math.max(80, Math.round(height))),
        });
      }
    });
  }

  /** The settings of Writing (from the dashboard): on or off, the programs left alone. */
  configure(config: WritingConfig): void {
    this.config = config;
    if (config.enabled && FieldWatch.supported) {
      this.watch.start();
    } else {
      this.watch.stop();
      this.clear();
    }
  }

  stop(): void {
    this.watch.stop();
    this.overlay?.destroy();
    this.card?.destroy();
  }

  private onEvent(event: FieldEvent): void {
    if (event.type === 'none') {
      this.field = null;
      this.clear();
      return;
    }
    if (event.type === 'caret') {
      void this.openAtCaret(event.at);
      return;
    }
    if (
      LEFT_TO_OTHERS.has(event.app) ||
      this.config.ignoredApps.includes(event.app)
    ) {
      this.field = null;
      this.clear();
      return;
    }
    const changed = event.text !== this.field?.text;
    this.field = {app: event.app, text: event.text};
    if (changed) {
      // The marks are stale the moment the text changes: gone until the next answer.
      this.issues = [];
      this.rects = [];
      this.hideCard();
      this.draw();
      if (this.timer) {
        clearTimeout(this.timer);
      }
      this.timer = setTimeout(() => void this.check(), CHECK_AFTER_MS);
    }
  }

  private async check(): Promise<void> {
    const field = this.field;
    if (!field || field.text.trim().length < MIN_LENGTH) {
      return;
    }
    const number = ++this.checkNumber;
    const issues = await this.server.check(field.text).catch(() => null);
    if (number !== this.checkNumber || this.field?.text !== field.text) {
      return;
    }
    this.issues = issues ?? [];
    await this.locate();
    this.keepFollowing();
  }

  /** Where the marked words are now (the field may have scrolled or moved). */
  private async locate(): Promise<void> {
    if (!this.issues.length) {
      this.rects = [];
    } else {
      const text = this.field?.text;
      const rects = await this.watch.rects(
        this.issues.map(issue => [issue.offset, issue.length]),
      );
      if (this.field?.text !== text) {
        return;
      }
      this.rects = rects;
    }
    this.draw();
  }

  private keepFollowing(): void {
    if (this.follow) {
      clearInterval(this.follow);
    }
    this.follow = this.issues.length
      ? setInterval(() => void this.locate(), FOLLOW_MS)
      : null;
  }

  private clear(): void {
    this.issues = [];
    this.rects = [];
    if (this.follow) {
      clearInterval(this.follow);
      this.follow = null;
    }
    this.hideCard();
    this.draw();
  }

  /** The marks, in the overlay of the display the field is on. */
  private draw(): void {
    const boxes = this.rects.flatMap((rects, index) =>
      rects.map(rect => ({rect, issue: this.issues[index]})),
    );
    if (!boxes.length) {
      if (this.overlay?.isVisible()) {
        this.overlay.webContents.send('writing-overlay:marks', []);
        this.overlay.hide();
      }
      return;
    }
    const first = this.dip(boxes[0].rect);
    const display = screen.getDisplayMatching(first);
    const overlay = this.ensureOverlay(display.bounds);
    const marks = boxes
      .map(({rect, issue}) => ({box: this.dip(rect), issue}))
      .filter(({box}) => box.width > 1)
      .map(({box, issue}) => ({
        x: box.x - display.bounds.x,
        y: box.y + box.height - 2 - display.bounds.y,
        width: box.width,
        colour: COLOURS[issue?.kind ?? 'other'],
      }));
    overlay.webContents.send('writing-overlay:marks', marks);
    if (!overlay.isVisible()) {
      overlay.showInactive();
    }
  }

  private ensureOverlay(bounds: Electron.Rectangle): BrowserWindow {
    if (!this.overlay || this.overlay.isDestroyed()) {
      this.overlay = new BrowserWindow({
        ...bounds,
        show: false,
        frame: false,
        transparent: true,
        focusable: false,
        resizable: false,
        movable: false,
        hasShadow: false,
        skipTaskbar: true,
        alwaysOnTop: true,
        webPreferences: {
          preload: join(__dirname, 'preload.js'),
          contextIsolation: true,
          sandbox: true,
        },
      });
      this.overlay.setAlwaysOnTop(true, 'screen-saver');
      this.overlay.setIgnoreMouseEvents(true);
      void this.overlay.loadFile(
        join(__dirname, 'assets', 'writing-overlay.html'),
      );
    } else {
      this.overlay.setBounds(bounds);
    }
    return this.overlay;
  }

  /** The caret is in a marked word: its card beside it. */
  private async openAtCaret(at: number): Promise<void> {
    const index = this.issues.findIndex(
      issue => at >= issue.offset && at <= issue.offset + issue.length,
    );
    if (index < 0) {
      this.hideCard();
      return;
    }
    const issue = this.issues[index];
    const rect = this.rects[index]?.[0];
    if (!rect || !this.field) {
      return;
    }
    if (issue === this.cardIssue && this.card?.isVisible()) {
      return;
    }
    this.cardIssue = issue;
    const box = this.dip(rect);
    const card = this.ensureCard();
    const area = screen.getDisplayMatching(box).workArea;
    card.setBounds({
      x: Math.max(area.x, Math.min(box.x, area.x + area.width - CARD_WIDTH)),
      y:
        box.y + box.height + 220 < area.y + area.height
          ? box.y + box.height + 4
          : box.y - 224,
      width: CARD_WIDTH,
      height: 200,
    });
    const word = this.field.text.slice(
      issue.offset,
      issue.offset + issue.length,
    );
    card.webContents.send('writing-card:show', {issue, word});
    card.showInactive();
  }

  private ensureCard(): BrowserWindow {
    if (!this.card || this.card.isDestroyed()) {
      this.card = new BrowserWindow({
        width: CARD_WIDTH,
        height: 200,
        show: false,
        frame: false,
        transparent: true,
        // Never the focus: the program the person writes in keeps it, and the fix goes there.
        focusable: false,
        resizable: false,
        skipTaskbar: true,
        alwaysOnTop: true,
        webPreferences: {
          preload: join(__dirname, 'preload.js'),
          contextIsolation: true,
          sandbox: true,
        },
      });
      this.card.setAlwaysOnTop(true, 'screen-saver');
      void this.card.loadFile(join(__dirname, 'assets', 'writing-card.html'));
    }
    return this.card;
  }

  private hideCard(): void {
    this.cardIssue = null;
    this.card?.hide();
  }

  private async onChoice({
    action,
    value,
  }: {
    action: string;
    value?: string;
  }): Promise<void> {
    const issue = this.cardIssue;
    const field = this.field;
    this.hideCard();
    if (!issue || !field) {
      return;
    }
    if (action === 'fix' && typeof value === 'string') {
      const word = field.text.slice(issue.offset, issue.offset + issue.length);
      await this.watch.replace(issue.offset, issue.length, value, word);
      void this.server.accepted(1);
    } else if (action === 'word' && value) {
      await this.server.ignore({word: value});
      void this.check();
    } else if (action === 'rule') {
      await this.server.ignore({ruleId: issue.ruleId});
      void this.check();
    }
  }

  /** Physical pixels of UI Automation to the points Electron places windows in. */
  private dip([x, y, width, height]: ScreenBox): Electron.Rectangle {
    return screen.screenToDipRect(null, {x, y, width, height});
  }
}
