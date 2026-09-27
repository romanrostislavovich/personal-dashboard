import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { LocalDate, MOODS } from '@pd/contracts';
import { firstValueFrom } from 'rxjs';
import { DiaryApi } from './diary.api';
import { MarkdownPipe } from '@pd/web-core';
import { MOOD_EMOJI } from './mood';

/** Editor for one day's entry: markdown + mood. */
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
  ],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-card-title class="title">{{ day() | date: 'EEEE, d MMMM y' }}</mat-card-title>
        <mat-card-subtitle>
          @if (dirty()) {
            {{ 'diary.editor.unsaved' | transloco }}
          } @else if (entry.value(); as saved) {
            {{ 'diary.editor.savedAt' | transloco }} {{ saved.updatedAt | date: 'd MMM, HH:mm' }}
          } @else {
            {{ 'diary.editor.empty' | transloco }}
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
                (click)="mood.set(mood() === value ? null : value)"
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

        @if (mode() === 'edit') {
          <textarea
            class="text"
            [(ngModel)]="content"
            [placeholder]="'diary.editor.placeholder' | transloco"
            (keydown.control.s)="$event.preventDefault(); save()"
            (keydown.meta.s)="$event.preventDefault(); save()"
          ></textarea>
        } @else {
          <div class="preview" [innerHTML]="content() | markdown"></div>
        }
        <p class="hint">{{ 'diary.editor.hint' | transloco }}</p>
      </mat-card-content>

      <mat-card-actions align="end">
        @if (entry.value()) {
          <button matButton type="button" (click)="remove()">
            {{ 'core.actions.delete' | transloco }}
          </button>
        }
        <button matButton="filled" type="button" [disabled]="!dirty() || saving()" (click)="save()">
          {{ 'core.actions.save' | transloco }}
        </button>
      </mat-card-actions>
    </mat-card>
  `,
  styles: `
    .title::first-letter {
      text-transform: uppercase;
    }
    .toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 8px;
      margin: 12px 0;
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
    .text {
      box-sizing: border-box;
      width: 100%;
      min-height: 360px;
      padding: 12px;
      resize: vertical;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 8px;
      background: var(--mat-sys-surface-container-lowest);
      color: inherit;
      font: var(--mat-sys-body-large);
      line-height: 1.6;
    }
    .text:focus {
      outline: 2px solid var(--mat-sys-primary);
      outline-offset: -1px;
    }
    .preview {
      min-height: 360px;
      padding: 0 4px;
      font: var(--mat-sys-body-large);
      line-height: 1.6;
    }
    .hint {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
  `,
})
export class DiaryEditorComponent {
  readonly day = input.required<LocalDate>();
  readonly saved = output<void>();

  private readonly api = inject(DiaryApi);
  private readonly transloco = inject(TranslocoService);

  protected readonly moods = MOODS;
  protected readonly moodEmoji = MOOD_EMOJI;
  protected readonly entry = this.api.entry(this.day);

  protected readonly content = signal('');
  protected readonly mood = signal<number | null>(null);
  protected readonly mode = signal<'edit' | 'preview'>('edit');
  protected readonly saving = signal(false);

  /** The last saved version — to know whether there are unsaved changes. */
  private readonly savedContent = signal('');
  private readonly savedMood = signal<number | null>(null);

  readonly dirty = computed(
    () => this.content() !== this.savedContent() || this.mood() !== this.savedMood(),
  );

  constructor() {
    // Another day's entry loaded — show it in the editor.
    effect(() => {
      // Only once the response arrives: while loading or on error, leave the editor alone.
      if (this.entry.status() !== 'resolved') {
        return;
      }
      const entry = this.entry.value() ?? null;
      this.applySaved(entry?.content ?? '', entry?.mood ?? null);
      this.mode.set(entry ? 'preview' : 'edit');
    });
  }

  async save(): Promise<void> {
    if (!this.dirty()) {
      return;
    }
    this.saving.set(true);
    try {
      await firstValueFrom(
        this.api.save(this.day(), { content: this.content(), mood: this.mood() }),
      );
      this.savedContent.set(this.content());
      this.savedMood.set(this.mood());
      this.entry.reload();
      this.saved.emit();
    } finally {
      this.saving.set(false);
    }
  }

  async remove(): Promise<void> {
    if (!confirm(this.transloco.translate('diary.editor.confirmDelete'))) {
      return;
    }
    await firstValueFrom(this.api.remove(this.day()));
    this.entry.reload();
    this.saved.emit();
  }

  private applySaved(content: string, mood: number | null): void {
    this.content.set(content);
    this.mood.set(mood);
    this.savedContent.set(content);
    this.savedMood.set(mood);
  }
}
