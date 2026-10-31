import {DatePipe} from '@angular/common';
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
import {FormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatButtonToggleModule} from '@angular/material/button-toggle';
import {MatCardModule} from '@angular/material/card';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {TranslocoPipe, TranslocoService} from '@jsverse/transloco';
import {
  DIARY_MARK_EMOJIS,
  DIARY_PHOTO_MAX_BYTES,
  LocalDate,
  markSelection,
  MOODS,
  TextEdit,
  unmarkAt,
} from '@pd/contracts';
import {OfflineService} from '@pd/web-core';
import {Editor} from '@tiptap/core';
import {firstValueFrom} from 'rxjs';
import {DiaryApi} from './diary.api';
import {DiaryPhotosComponent} from './diary-photos.component';
import {questionOfTheDay} from './diary-questions';
import {diaryEditorExtensions, entryMarkdown} from './editor/diary-markdown';
import {photoIdsIn, photoSrc} from './editor/diary-images';
import {PhotoUrls} from './editor/photo-urls';
import {
  FORMAT_ACTIONS,
  FormatAction,
  TABLE_ACTIONS,
} from './editor/format-actions';
import {MOOD_EMOJI} from './mood';

/** Pause in typing after which the entry is saved. */
const AUTOSAVE_DELAY_MS = 1200;

interface Snapshot {
  day: LocalDate;
  content: string;
  mood: number | null;
  /** The stored version the text was written over (see DiaryEntryInput.basedOn). */
  basedOn: string | null;
}

/** What the editor shows for a day without an entry. */
const NO_ENTRY = {content: '', mood: null, updatedAt: null};

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
  templateUrl: './diary-editor.component.html',
  styleUrl: './diary-editor.component.scss',
})
export class DiaryEditorComponent {
  readonly day = input.required<LocalDate>();
  /** Template from the diary settings; offered for an empty day. */
  readonly template = input<string | null>(null);
  readonly saved = output<void>();

  private readonly api = inject(DiaryApi);
  private readonly transloco = inject(TranslocoService);
  private readonly injector = inject(Injector);
  private readonly textarea =
    viewChild<ElementRef<HTMLTextAreaElement>>('text');
  private readonly visualHost =
    viewChild.required<ElementRef<HTMLElement>>('visual');

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
    questionOfTheDay(
      this.day(),
      this.transloco.getActiveLang(),
      this.questionShift(),
    ),
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
  /**
   * `updatedAt` of the stored entry this editor writes over; `null` — none was stored. Kept
   * while saves wait offline, so the server can tell when another device changed the day.
   */
  private basedOn: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private editor: Editor | null = null;
  /** Object URLs of photos shown in the text, by address; revoked when the editor goes away. */
  private readonly photoUrls = new PhotoUrls(id => this.api.photoBlob(id));

  constructor() {
    afterNextRender(() => this.createEditor());

    // Another day's entry loaded — show it in the editor.
    effect(() => {
      // Only once the response arrives: while loading or on error, leave the editor alone.
      if (this.entry.status() !== 'resolved') {
        return;
      }
      const {content, mood, updatedAt} = this.entry.value() ?? NO_ENTRY;
      untracked(() => {
        this.content.set(content);
        this.mood.set(mood);
        this.savedAt.set(updatedAt);
        this.basedOn = updatedAt;
        this.status.set('idle');
        this.questionShift.set(0);
        this.setEditorContent(content);
      });
    });

    // Changes made offline reached the server, which may have joined them with another
    // device's text: read the day again, unless something new is being typed.
    const synced = inject(OfflineService).synced;
    let seen = synced();
    effect(() => {
      const count = synced();
      untracked(() => {
        if (count !== seen && !this.pending) {
          this.entry.reload();
        }
        seen = count;
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
      this.photoUrls.revokeAll();
    });
  }

  protected setMood(value: number): void {
    this.mood.set(this.mood() === value ? null : value);
    this.scheduleSave();
  }

  /** Remembers what to save and waits for a pause in typing. */
  protected scheduleSave(): void {
    this.pending = {
      day: this.day(),
      content: this.content(),
      mood: this.mood(),
      basedOn: this.basedOn,
    };
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
      const saved = await firstValueFrom(
        this.api.save(snapshot.day, {
          content: snapshot.content,
          mood: snapshot.mood,
          basedOn: snapshot.basedOn,
        }),
      );
      if (snapshot.day === this.day()) {
        this.savedAt.set(new Date().toISOString());
        // `undefined`: queued offline — the version written over stays the same.
        if (saved !== undefined) {
          this.basedOn = saved?.updatedAt ?? null;
          // Another device changed the day meanwhile: the server kept both texts.
          if (saved && saved.content !== snapshot.content && !this.pending) {
            this.content.set(saved.content);
            this.mood.set(saved.mood);
            this.setEditorContent(saved.content);
          }
        }
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
      const {selectionStart, selectionEnd} = textarea;
      this.applyEdit(
        markSelection(this.content(), selectionStart, selectionEnd, emoji),
      );
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
    this.reload();
    this.saved.emit();
  }

  /** Drops unsaved text and shows the day as stored (after the diary was deleted, say). */
  reload(): void {
    this.pending = null;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.entry.reload();
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
    const images = files.filter(file => file.type.startsWith('image/'));
    if (!this.editor || images.length === 0) {
      return;
    }
    this.photoError.set(null);
    this.uploading.set(true);
    const day = this.day();
    try {
      for (const file of images) {
        if (file.size > DIARY_PHOTO_MAX_BYTES) {
          this.photoError.set(
            this.transloco.translate('diary.photos.tooLarge'),
          );
          continue;
        }
        const photo = await firstValueFrom(this.api.uploadPhoto(day, file));
        if (day !== this.day()) {
          return; // The user moved to another day: the photo stays in that day's strip.
        }
        const chain = this.editor.chain().focus();
        (position === undefined ? chain : chain.setTextSelection(position))
          .setImage({src: photoSrc(photo.id), alt: ''})
          .run();
        position = undefined;
      }
    } catch {
      this.photoError.set(
        this.transloco.translate('diary.photos.uploadFailed'),
      );
    } finally {
      this.uploading.set(false);
    }
  }

  private createEditor(): void {
    this.editor = new Editor({
      element: this.visualHost().nativeElement,
      extensions: diaryEditorExtensions({
        placeholder: () => this.transloco.translate('diary.editor.placeholder'),
        loadImage: src => this.photoUrls.load(src),
      }),
      content: this.content(),
      contentType: 'markdown',
      onUpdate: ({editor}) => {
        this.content.set(entryMarkdown(editor));
        this.scheduleSave();
      },
      onTransaction: () => this.editorState.update(value => value + 1),
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
          if (!files.some(file => file.type.startsWith('image/'))) {
            return false;
          }
          void this.insertPhotos(files);
          return true;
        },
        handleDrop: (view, event, _slice, moved) => {
          const files = [...(event.dataTransfer?.files ?? [])];
          if (moved || !files.some(file => file.type.startsWith('image/'))) {
            return false;
          }
          event.preventDefault();
          const at = view.posAtCoords({
            left: event.clientX,
            top: event.clientY,
          });
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
    this.editor?.commands.setContent(content, {
      contentType: 'markdown',
      emitUpdate: false,
    });
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
      {injector: this.injector},
    );
  }
}
