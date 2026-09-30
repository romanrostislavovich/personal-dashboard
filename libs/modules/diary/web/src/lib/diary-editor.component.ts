import { DatePipe } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import {
  DIARY_MARK_EMOJIS,
  DIARY_PHOTO_MAX_BYTES,
  LocalDate,
  markSelection,
  MOODS,
  TextEdit,
  unmarkAt,
} from '@pd/contracts';
import { Editor } from '@tiptap/core';
import { firstValueFrom } from 'rxjs';
import { DiaryApi } from './diary.api';
import { DiaryPhotosComponent } from './diary-photos.component';
import { questionOfTheDay } from './diary-questions';
import { diaryEditorExtensions, entryMarkdown } from './editor/diary-markdown';
import { photoIdFromSrc, photoIdsIn, photoSrc } from './editor/diary-images';
import { FORMAT_ACTIONS, FormatAction, TABLE_ACTIONS } from './editor/format-actions';
import { MOOD_EMOJI } from './mood';

/** Pause in typing after which the entry is saved. */
const AUTOSAVE_DELAY_MS = 1200;

interface Snapshot {
  day: LocalDate;
  content: string;
  mood: number | null;
}

/** What the editor shows for a day without an entry. */
const NO_ENTRY = { content: '', mood: null, updatedAt: null };

type EditorMode = 'visual' | 'markdown';

/**
 * Editor for one day's entry: a visual (WYSIWYG) editor or the Markdown source, mood,
 * emoji marks, photos. The entry is stored as Markdown either way.
 * Saves by itself a moment after you stop typing (and right away when switching days).
 */
@Component({
  selector: 'pd-diary-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    MatTooltipModule,
    TranslocoPipe,
    DiaryPhotosComponent,
  ],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-card-title class="title">{{ day() | date: 'EEEE, d MMMM y' }}</mat-card-title>
        <mat-card-subtitle class="status" [class.error]="status() === 'error'">
          @switch (status()) {
            @case ('saving') {
              {{ 'diary.editor.saving' | transloco }}
            }
            @case ('error') {
              {{ 'diary.editor.saveFailed' | transloco }}
            }
            @default {
              @if (savedAt(); as at) {
                <mat-icon inline>cloud_done</mat-icon>
                {{ 'diary.editor.savedAt' | transloco }} {{ at | date: 'HH:mm' }}
              } @else {
                {{ 'diary.editor.empty' | transloco }}
              }
            }
          }
        </mat-card-subtitle>
      </mat-card-header>

      <mat-card-content>
        <div class="toolbar">
          <div class="moods" role="radiogroup" [attr.aria-label]="'diary.editor.mood' | transloco">
            @for (value of moods; track value) {
              <button
                matIconButton
                type="button"
                role="radio"
                class="mood"
                [class.selected]="mood() === value"
                [attr.aria-checked]="mood() === value"
                [matTooltip]="'diary.moods.' + value | transloco"
                (click)="setMood(value)"
              >
                {{ moodEmoji[value] }}
              </button>
            }
          </div>
          <mat-button-toggle-group
            [value]="mode()"
            (change)="switchMode($event.value)"
            hideSingleSelectionIndicator
          >
            <mat-button-toggle value="visual">
              <mat-icon>edit_note</mat-icon> {{ 'diary.editor.visual' | transloco }}
            </mat-button-toggle>
            <mat-button-toggle value="markdown">
              <mat-icon>code</mat-icon> {{ 'diary.editor.markdown' | transloco }}
            </mat-button-toggle>
          </mat-button-toggle-group>
        </div>

        <!-- mousedown is prevented so the text selection survives the click -->
        <div class="marks" role="toolbar" [attr.aria-label]="'diary.editor.toolbar' | transloco">
          @if (mode() === 'visual') {
            @for (action of formatActions; track action.id) {
              <button
                matIconButton
                type="button"
                class="format"
                [class.active]="isActive(action)"
                [attr.aria-pressed]="isActive(action)"
                [matTooltip]="'diary.editor.format.' + action.id | transloco"
                [attr.aria-label]="'diary.editor.format.' + action.id | transloco"
                (mousedown)="$event.preventDefault()"
                (click)="format(action)"
              >
                <mat-icon>{{ action.icon }}</mat-icon>
              </button>
            }
            <label
              class="format photo-button"
              [class.busy]="uploading()"
              [matTooltip]="'diary.editor.format.photo' | transloco"
            >
              <input
                type="file"
                accept="image/*"
                multiple
                hidden
                [attr.aria-label]="'diary.editor.format.photo' | transloco"
                (change)="pickPhotos($event)"
              />
              <mat-icon>add_photo_alternate</mat-icon>
            </label>
            <span class="divider"></span>
          }
          @for (emoji of markEmojis; track emoji) {
            <button
              type="button"
              class="mark-button"
              [matTooltip]="'diary.editor.markTitle' | transloco"
              (mousedown)="$event.preventDefault()"
              (click)="mark(emoji)"
            >
              {{ emoji }}
            </button>
          }
          <button
            matIconButton
            type="button"
            class="unmark"
            [matTooltip]="'diary.editor.unmark' | transloco"
            [attr.aria-label]="'diary.editor.unmark' | transloco"
            (mousedown)="$event.preventDefault()"
            (click)="unmark()"
          >
            <mat-icon>ink_eraser</mat-icon>
          </button>
        </div>

        @if (mode() === 'visual' && inTable()) {
          <div class="marks table-tools" role="toolbar">
            <span class="table-label">{{ 'diary.editor.format.table' | transloco }}:</span>
            @for (action of tableActions; track action.id) {
              <button
                matIconButton
                type="button"
                class="format"
                [matTooltip]="'diary.editor.format.' + action.id | transloco"
                [attr.aria-label]="'diary.editor.format.' + action.id | transloco"
                (mousedown)="$event.preventDefault()"
                (click)="format(action)"
              >
                <mat-icon>{{ action.icon }}</mat-icon>
              </button>
            }
          </div>
        }
        @if (photoError(); as message) {
          <p class="photo-error">{{ message }}</p>
        }

        @if (!content().trim()) {
          <div class="starter">
            @if (template()) {
              <button matButton="tonal" type="button" (click)="insertTemplate()">
                <mat-icon>article</mat-icon> {{ 'diary.editor.insertTemplate' | transloco }}
              </button>
            }
            <div class="question">
              <span class="question-label">💭 {{ 'diary.editor.question' | transloco }}</span>
              <span class="question-text">{{ question() }}</span>
              <span class="question-actions">
                <button matButton type="button" (click)="answer()">
                  {{ 'diary.editor.answer' | transloco }}
                </button>
                <button matButton type="button" (click)="questionShift.set(questionShift() + 1)">
                  {{ 'diary.editor.anotherQuestion' | transloco }}
                </button>
              </span>
            </div>
          </div>
        }

        <!-- Kept in the DOM while the source is shown, so the visual editor keeps its undo history -->
        <div #visual class="text visual" [hidden]="mode() !== 'visual'"></div>
        @if (mode() === 'markdown') {
          <textarea
            #text
            class="text"
            [ngModel]="content()"
            (ngModelChange)="content.set($event); scheduleSave()"
            [placeholder]="'diary.editor.placeholder' | transloco"
            (keydown.control.s)="$event.preventDefault(); flush()"
            (keydown.meta.s)="$event.preventDefault(); flush()"
          ></textarea>
        }

        <h4 class="section">{{ 'diary.photos.title' | transloco }}</h4>
        <pd-diary-photos [day]="day()" [hiddenIds]="photosInText()" />

        <p class="hint">{{ 'diary.editor.hint' | transloco }}</p>
      </mat-card-content>

      @if (entry.value()) {
        <mat-card-actions align="end">
          <button matButton type="button" (click)="remove()">
            {{ 'core.actions.delete' | transloco }}
          </button>
        </mat-card-actions>
      }
    </mat-card>
  `,
  styles: `
    .title::first-letter {
      text-transform: uppercase;
    }
    .status {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .status.error {
      color: var(--mat-sys-error);
    }
    .toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 8px;
      margin: 12px 0 8px;
    }
    .moods {
      display: flex;
      gap: 2px;
    }
    .mood {
      font-size: 22px;
      opacity: 0.5;
      filter: grayscale(1);
      transition:
        opacity 0.15s,
        filter 0.15s;
    }
    .mood:hover {
      opacity: 0.9;
      filter: none;
    }
    .mood.selected {
      opacity: 1;
      filter: none;
      background: var(--mat-sys-secondary-container);
    }
    .marks {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 2px;
      margin-bottom: 10px;
      padding: 4px 6px;
      border-radius: 12px;
      background: color-mix(in srgb, var(--mat-sys-on-surface) 4%, transparent);
    }
    .format {
      color: var(--mat-sys-on-surface-variant);
    }
    .format.active {
      color: var(--mat-sys-on-secondary-container);
      background: var(--mat-sys-secondary-container);
    }
    .photo-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      cursor: pointer;
    }
    .photo-button:hover {
      background: color-mix(in srgb, var(--mat-sys-on-surface) 8%, transparent);
    }
    .photo-button.busy {
      opacity: 0.5;
      pointer-events: none;
    }
    .table-tools {
      margin-top: -4px;
    }
    .table-label {
      margin: 0 6px;
      font: 600 0.75rem / 1.2 var(--pd-font);
      color: var(--mat-sys-on-surface-variant);
    }
    .photo-error {
      margin: 0 0 8px;
      color: var(--mat-sys-error);
      font: 0.8rem / 1.3 var(--pd-font);
    }
    .divider {
      width: 1px;
      height: 24px;
      margin: 0 6px;
      background: var(--pd-border);
    }
    .mark-button {
      width: 34px;
      height: 34px;
      border: 0;
      border-radius: 10px;
      background: none;
      font-size: 18px;
      cursor: pointer;
    }
    .mark-button:hover,
    .mark-button:focus-visible {
      background: color-mix(in srgb, var(--mat-sys-primary) 16%, transparent);
    }
    .starter {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 10px;
      margin-bottom: 10px;
    }
    .question {
      display: flex;
      flex-direction: column;
      gap: 4px;
      width: 100%;
      box-sizing: border-box;
      padding: 12px 14px;
      border-radius: 14px;
      border: 1px dashed color-mix(in srgb, var(--mat-sys-primary) 45%, var(--pd-border));
    }
    .question-label {
      font: 600 0.7rem / 1.2 var(--pd-font);
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--mat-sys-primary);
    }
    .question-text {
      font: 600 1rem / 1.4 var(--pd-font-heading);
    }
    .question-actions {
      display: flex;
      gap: 4px;
      margin-left: -12px;
    }
    .text {
      box-sizing: border-box;
      width: 100%;
      min-height: 360px;
      padding: 14px;
      resize: vertical;
      border: 1px solid var(--pd-border);
      border-radius: 14px;
      background: var(--mat-sys-surface-container-lowest);
      color: inherit;
      font: 1rem / 1.65 var(--pd-font);
    }
    .text:focus,
    .visual:focus-within {
      outline: 2px solid var(--mat-sys-primary);
      outline-offset: -1px;
    }
    .visual {
      resize: none;
      cursor: text;
    }
    .visual[hidden] {
      display: none;
    }
    .visual ::ng-deep .ProseMirror {
      min-height: 330px;
      outline: none;
      white-space: pre-wrap;
      overflow-wrap: break-word;
    }
    .visual ::ng-deep .ProseMirror > :first-child {
      margin-top: 0;
    }
    .visual ::ng-deep p.is-editor-empty:first-child::before {
      content: attr(data-placeholder);
      float: left;
      height: 0;
      pointer-events: none;
      color: var(--mat-sys-on-surface-variant);
    }
    .visual ::ng-deep blockquote {
      margin: 0.5em 0;
      padding-left: 12px;
      border-left: 3px solid var(--pd-border);
      color: var(--mat-sys-on-surface-variant);
    }
    .visual ::ng-deep .diary-mark {
      padding: 1px 4px;
      border-radius: 6px;
      color: inherit;
      background: color-mix(in srgb, var(--mat-sys-tertiary) 22%, transparent);
    }
    .visual ::ng-deep .diary-image {
      display: block;
      max-width: 100%;
      max-height: 480px;
      margin: 8px 0;
      border-radius: 12px;
    }
    .visual ::ng-deep .diary-image.ProseMirror-selectednode {
      outline: 3px solid var(--mat-sys-primary);
    }
    .visual ::ng-deep .diary-image.broken {
      min-width: 120px;
      min-height: 80px;
      background: color-mix(in srgb, var(--mat-sys-on-surface) 8%, transparent);
    }
    .visual ::ng-deep table {
      width: 100%;
      margin: 8px 0;
      border-collapse: collapse;
      table-layout: fixed;
    }
    .visual ::ng-deep th,
    .visual ::ng-deep td {
      padding: 6px 10px;
      border: 1px solid var(--pd-border);
      vertical-align: top;
    }
    .visual ::ng-deep th {
      background: color-mix(in srgb, var(--mat-sys-on-surface) 5%, transparent);
      text-align: left;
    }
    .visual ::ng-deep th p,
    .visual ::ng-deep td p {
      margin: 0;
    }
    .visual ::ng-deep .selectedCell {
      background: color-mix(in srgb, var(--mat-sys-primary) 14%, transparent);
    }
    /* The emoji is not part of the text: it is drawn from the mark's attribute. */
    .visual ::ng-deep .diary-mark[data-emoji]::before {
      content: attr(data-emoji) ' ';
    }
    .section {
      font: 700 0.9rem / 1.3 var(--pd-font-heading);
      margin: 20px 0 10px;
    }
    .hint {
      margin: 16px 0 0;
      color: var(--mat-sys-on-surface-variant);
      font: 0.78rem / 1.4 var(--pd-font);
    }
  `,
})
export class DiaryEditorComponent {
  readonly day = input.required<LocalDate>();
  /** Template from the diary settings; offered for an empty day. */
  readonly template = input<string | null>(null);
  readonly saved = output<void>();

  private readonly api = inject(DiaryApi);
  private readonly transloco = inject(TranslocoService);
  private readonly injector = inject(Injector);
  private readonly textarea = viewChild<ElementRef<HTMLTextAreaElement>>('text');
  private readonly visualHost = viewChild.required<ElementRef<HTMLElement>>('visual');

  protected readonly moods = MOODS;
  protected readonly moodEmoji = MOOD_EMOJI;
  protected readonly markEmojis = DIARY_MARK_EMOJIS;
  protected readonly formatActions = FORMAT_ACTIONS;
  protected readonly tableActions = TABLE_ACTIONS;
  protected readonly entry = this.api.entry(this.day);

  protected readonly content = signal('');
  protected readonly mood = signal<number | null>(null);
  protected readonly mode = signal<EditorMode>('visual');
  protected readonly status = signal<'idle' | 'saving' | 'error'>('idle');
  protected readonly savedAt = signal<string | null>(null);
  protected readonly questionShift = signal(0);
  protected readonly question = computed(() =>
    questionOfTheDay(this.day(), this.transloco.getActiveLang(), this.questionShift()),
  );
  /** Photos placed in the text: the photo strip below does not repeat them. */
  protected readonly photosInText = computed(() => photoIdsIn(this.content()));
  protected readonly uploading = signal(false);
  protected readonly photoError = signal<string | null>(null);
  /** Bumped on every editor transaction, so the formatting buttons show the current state. */
  private readonly editorState = signal(0);
  protected readonly inTable = computed(() => {
    this.editorState();
    return this.editor?.isActive('table') ?? false;
  });

  private pending: Snapshot | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private editor: Editor | null = null;
  /** Object URLs of photos shown in the text, by address; revoked when the editor goes away. */
  private readonly photoUrls = new Map<string, Promise<string>>();

  constructor() {
    afterNextRender(() => this.createEditor());

    // Another day's entry loaded — show it in the editor.
    effect(() => {
      // Only once the response arrives: while loading or on error, leave the editor alone.
      if (this.entry.status() !== 'resolved') {
        return;
      }
      const { content, mood, updatedAt } = this.entry.value() ?? NO_ENTRY;
      untracked(() => {
        this.content.set(content);
        this.mood.set(mood);
        this.savedAt.set(updatedAt);
        this.status.set('idle');
        this.questionShift.set(0);
        this.setEditorContent(content);
      });
    });

    // Switching days (or leaving the page) saves what was typed for the previous day.
    effect(() => {
      this.day();
      untracked(() => void this.flush());
    });
    inject(DestroyRef).onDestroy(() => {
      void this.flush();
      this.editor?.destroy();
      this.photoUrls.forEach((url) => void url.then(URL.revokeObjectURL, () => undefined));
    });
  }

  protected setMood(value: number): void {
    this.mood.set(this.mood() === value ? null : value);
    this.scheduleSave();
  }

  /** Remembers what to save and waits for a pause in typing. */
  protected scheduleSave(): void {
    this.pending = { day: this.day(), content: this.content(), mood: this.mood() };
    this.status.set('saving');
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => void this.flush(), AUTOSAVE_DELAY_MS);
  }

  /** Saves the pending changes now. The snapshot keeps its day, so a late save never lands on another day. */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const snapshot = this.pending;
    if (!snapshot) {
      return;
    }
    this.pending = null;
    this.status.set('saving');
    try {
      await firstValueFrom(
        this.api.save(snapshot.day, { content: snapshot.content, mood: snapshot.mood }),
      );
      if (snapshot.day === this.day()) {
        this.savedAt.set(new Date().toISOString());
      }
      this.status.set('idle');
      this.saved.emit();
    } catch {
      this.status.set('error');
    }
  }

  /**
   * Marks the selected text with the emoji; with nothing selected — the paragraph under
   * the cursor.
   */
  protected mark(emoji: string): void {
    const textarea = this.textarea()?.nativeElement;
    if (this.mode() === 'markdown' && textarea) {
      const { selectionStart, selectionEnd } = textarea;
      this.applyEdit(markSelection(this.content(), selectionStart, selectionEnd, emoji));
    } else {
      this.editor?.chain().focus().setDiaryMark(emoji).run();
    }
  }

  protected unmark(): void {
    const textarea = this.textarea()?.nativeElement;
    if (this.mode() === 'markdown' && textarea) {
      const edit = unmarkAt(this.content(), textarea.selectionStart);
      if (edit) {
        this.applyEdit(edit);
      }
    } else {
      this.editor?.chain().focus().unsetDiaryMark().run();
    }
  }

  protected format(action: FormatAction): void {
    if (this.editor) {
      action.run(this.editor.chain().focus()).run();
    }
  }

  protected isActive(action: FormatAction): boolean {
    this.editorState();
    return this.editor ? action.isActive(this.editor) : false;
  }

  /** The visual editor re-reads the source when it comes back: it may have been edited. */
  protected switchMode(mode: EditorMode): void {
    if (mode === 'visual') {
      this.setEditorContent(this.content());
    }
    this.mode.set(mode);
    this.focusText(null);
  }

  protected insertTemplate(): void {
    this.replaceContent(this.template() ?? '');
  }

  protected answer(): void {
    this.replaceContent(`**${this.question()}**\n\n`);
  }

  async remove(): Promise<void> {
    if (!confirm(this.transloco.translate('diary.editor.confirmDelete'))) {
      return;
    }
    this.pending = null;
    await firstValueFrom(this.api.remove(this.day()));
    this.entry.reload();
    this.saved.emit();
  }

  protected pickPhotos(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = '';
    void this.insertPhotos(files);
  }

  /**
   * Uploads the images as photos of the day and puts them at the cursor (or at `position`,
   * where they were dropped), one after another.
   */
  private async insertPhotos(files: File[], position?: number): Promise<void> {
    const images = files.filter((file) => file.type.startsWith('image/'));
    if (!this.editor || images.length === 0) {
      return;
    }
    this.photoError.set(null);
    this.uploading.set(true);
    const day = this.day();
    try {
      for (const file of images) {
        if (file.size > DIARY_PHOTO_MAX_BYTES) {
          this.photoError.set(this.transloco.translate('diary.photos.tooLarge'));
          continue;
        }
        const photo = await firstValueFrom(this.api.uploadPhoto(day, file));
        if (day !== this.day()) {
          return; // The user moved to another day: the photo stays in that day's strip.
        }
        const chain = this.editor.chain().focus();
        (position === undefined ? chain : chain.setTextSelection(position))
          .setImage({ src: photoSrc(photo.id), alt: '' })
          .run();
        position = undefined;
      }
    } catch {
      this.photoError.set(this.transloco.translate('diary.photos.uploadFailed'));
    } finally {
      this.uploading.set(false);
    }
  }

  /** Diary photos need the auth header: they are loaded as blobs and shown via object URLs. */
  private loadImage(src: string): Promise<string> {
    const id = photoIdFromSrc(src);
    if (!id) {
      return Promise.resolve(src);
    }
    let url = this.photoUrls.get(src);
    if (!url) {
      url = firstValueFrom(this.api.photoBlob(id)).then((blob) => URL.createObjectURL(blob));
      this.photoUrls.set(src, url);
    }
    return url;
  }

  private createEditor(): void {
    this.editor = new Editor({
      element: this.visualHost().nativeElement,
      extensions: diaryEditorExtensions({
        placeholder: () => this.transloco.translate('diary.editor.placeholder'),
        loadImage: (src) => this.loadImage(src),
      }),
      content: this.content(),
      contentType: 'markdown',
      onUpdate: ({ editor }) => {
        this.content.set(entryMarkdown(editor));
        this.scheduleSave();
      },
      onTransaction: () => this.editorState.update((value) => value + 1),
      editorProps: {
        // Ctrl+S / Cmd+S saves right away, as in the Markdown source.
        handleKeyDown: (_view, event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === 's') {
            event.preventDefault();
            void this.flush();
            return true;
          }
          return false;
        },
        // A pasted or dropped picture becomes a photo of the day, right where it was put.
        handlePaste: (_view, event) => {
          const files = [...(event.clipboardData?.files ?? [])];
          if (!files.some((file) => file.type.startsWith('image/'))) {
            return false;
          }
          void this.insertPhotos(files);
          return true;
        },
        handleDrop: (view, event, _slice, moved) => {
          const files = [...(event.dataTransfer?.files ?? [])];
          if (moved || !files.some((file) => file.type.startsWith('image/'))) {
            return false;
          }
          event.preventDefault();
          const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
          void this.insertPhotos(files, at?.pos);
          return true;
        },
      },
    });
  }

  /**
   * Shows `content` in the visual editor without treating it as a change: an entry that was
   * only opened is never re-saved, so its Markdown stays exactly as it was written.
   */
  private setEditorContent(content: string): void {
    this.editor?.commands.setContent(content, { contentType: 'markdown', emitUpdate: false });
  }

  /** Replaces the whole entry (a template, a question) and puts the cursor at the end. */
  private replaceContent(content: string): void {
    this.content.set(content);
    this.setEditorContent(content);
    this.scheduleSave();
    this.focusText(content.length);
  }

  private applyEdit(edit: TextEdit): void {
    this.content.set(edit.content);
    this.scheduleSave();
    this.focusText(edit.selectionStart, edit.selectionEnd);
  }

  /**
   * Focuses the current editor once it has re-rendered: the source — at the given range
   * (or where it was), the visual editor — at the end of the text.
   */
  private focusText(start: number | null, end = start): void {
    afterNextRender(
      () => {
        if (this.mode() === 'visual') {
          this.editor?.commands.focus('end');
          return;
        }
        const textarea = this.textarea()?.nativeElement;
        textarea?.focus();
        if (start !== null && end !== null) {
          textarea?.setSelectionRange(start, end);
        }
      },
      { injector: this.injector },
    );
  }
}
