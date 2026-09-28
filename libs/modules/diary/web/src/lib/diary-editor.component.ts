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
  LocalDate,
  markSelection,
  MOODS,
  TextEdit,
  unmarkAt,
} from '@pd/contracts';
import { MarkdownPipe } from '@pd/web-core';
import { firstValueFrom } from 'rxjs';
import { DiaryApi } from './diary.api';
import { DiaryPhotosComponent } from './diary-photos.component';
import { questionOfTheDay } from './diary-questions';
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

/** Positions in the markdown source (`content`). */
interface SourceRange {
  start: number;
  end: number;
}

/**
 * Editor for one day's entry: markdown, mood, emoji marks, photos.
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
    MarkdownPipe,
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
            (change)="mode.set($event.value)"
            hideSingleSelectionIndicator
          >
            <mat-button-toggle value="edit">
              <mat-icon>edit</mat-icon> {{ 'diary.editor.edit' | transloco }}
            </mat-button-toggle>
            <mat-button-toggle value="preview">
              <mat-icon>visibility</mat-icon> {{ 'diary.editor.preview' | transloco }}
            </mat-button-toggle>
          </mat-button-toggle-group>
        </div>

        <!-- mousedown is prevented so the text selection survives the click -->
        <div class="marks" role="toolbar" [attr.aria-label]="'diary.editor.markTitle' | transloco">
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
          @if (markHint()) {
            <span class="mark-hint">{{ 'diary.editor.markPreviewHint' | transloco }}</span>
          }
        </div>

        @if (mode() === 'edit' && !content().trim()) {
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

        @if (mode() === 'edit') {
          <textarea
            #text
            class="text"
            [ngModel]="content()"
            (ngModelChange)="content.set($event); scheduleSave()"
            [placeholder]="'diary.editor.placeholder' | transloco"
            (keydown.control.s)="$event.preventDefault(); flush()"
            (keydown.meta.s)="$event.preventDefault(); flush()"
          ></textarea>
        } @else {
          <div #preview class="preview" [innerHTML]="content() | markdown"></div>
        }

        <h4 class="section">{{ 'diary.photos.title' | transloco }}</h4>
        <pd-diary-photos [day]="day()" />

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
    .mark-hint {
      margin-left: 8px;
      font: 0.75rem / 1.3 var(--pd-font);
      color: var(--mat-sys-on-surface-variant);
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
    .text:focus {
      outline: 2px solid var(--mat-sys-primary);
      outline-offset: -1px;
    }
    .preview {
      min-height: 360px;
      padding: 0 4px;
      font: 1rem / 1.65 var(--pd-font);
    }
    .preview ::ng-deep .md-mark {
      padding: 1px 4px;
      border-radius: 6px;
      color: inherit;
      background: color-mix(in srgb, var(--mat-sys-tertiary) 22%, transparent);
    }
    .preview ::ng-deep .md-mark-emoji {
      margin-right: 4px;
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
  private readonly previewElement = viewChild<ElementRef<HTMLElement>>('preview');

  protected readonly moods = MOODS;
  protected readonly moodEmoji = MOOD_EMOJI;
  protected readonly markEmojis = DIARY_MARK_EMOJIS;
  protected readonly entry = this.api.entry(this.day);

  protected readonly content = signal('');
  protected readonly mood = signal<number | null>(null);
  protected readonly mode = signal<'edit' | 'preview'>('edit');
  protected readonly status = signal<'idle' | 'saving' | 'error'>('idle');
  protected readonly savedAt = signal<string | null>(null);
  protected readonly markHint = signal(false);
  protected readonly questionShift = signal(0);
  protected readonly question = computed(() =>
    questionOfTheDay(this.day(), this.transloco.getActiveLang(), this.questionShift()),
  );

  private pending: Snapshot | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
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
        this.mode.set(content.trim() ? 'preview' : 'edit');
        this.questionShift.set(0);
      });
    });

    // Switching days (or leaving the page) saves what was typed for the previous day.
    effect(() => {
      this.day();
      untracked(() => void this.flush());
    });
    inject(DestroyRef).onDestroy(() => void this.flush());
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

  /** Marks the selected text with the emoji; with nothing selected shows how to do it. */
  protected mark(emoji: string): void {
    const range = this.textareaSelection() ?? this.previewSelection();
    this.markHint.set(range === null);
    if (range) {
      this.applyEdit(markSelection(this.content(), range.start, range.end, emoji));
    }
  }

  protected unmark(): void {
    const textarea = this.textarea()?.nativeElement;
    if (!textarea) {
      this.markHint.set(true);
      return;
    }
    const edit = unmarkAt(this.content(), textarea.selectionStart);
    if (edit) {
      this.applyEdit(edit);
    }
  }

  protected insertTemplate(): void {
    this.content.set(this.template() ?? '');
    this.focusText(this.content().length);
  }

  protected answer(): void {
    this.content.set(`**${this.question()}**\n\n`);
    this.focusText(this.content().length);
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

  /** The selection in the source text while editing. */
  private textareaSelection(): SourceRange | null {
    const textarea = this.textarea()?.nativeElement;
    if (this.mode() !== 'edit' || !textarea) {
      return null;
    }
    return { start: textarea.selectionStart, end: textarea.selectionEnd };
  }

  /**
   * Text selected in the preview, found in the source. Formatting inside the selection
   * (bold, links) breaks the match — then there is nothing to mark.
   */
  private previewSelection(): SourceRange | null {
    const selection = window.getSelection();
    const preview = this.previewElement()?.nativeElement;
    if (!selection || !preview?.contains(selection.anchorNode)) {
      return null;
    }
    const selected = selection.toString().trim();
    const start = selected ? this.content().indexOf(selected) : -1;
    if (start === -1) {
      return null;
    }
    selection.removeAllRanges();
    return { start, end: start + selected.length };
  }

  private applyEdit(edit: TextEdit): void {
    this.content.set(edit.content);
    this.scheduleSave();
    this.focusText(edit.selectionStart, edit.selectionEnd);
  }

  /** Puts the cursor into the textarea once it has re-rendered with the new text. */
  private focusText(start: number, end = start): void {
    afterNextRender(
      () => {
        const textarea = this.textarea()?.nativeElement;
        textarea?.focus();
        textarea?.setSelectionRange(start, end);
      },
      { injector: this.injector },
    );
  }
}
