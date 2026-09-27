import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { TranslocoPipe } from '@jsverse/transloco';
import { LocalDate, parseLocalDate } from '@pd/contracts';
import { DiaryApi } from './diary.api';
import { MOOD_EMOJI } from './mood';

/** "On this day": what was written a month ago and on this date in previous years. */
@Component({
  selector: 'pd-diary-memories',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, MatCardModule, TranslocoPipe],
  template: `
    @if (memories.value().length) {
      <mat-card appearance="outlined">
        <mat-card-header>
          <mat-card-title>🕰️ {{ 'diary.memories.title' | transloco }}</mat-card-title>
        </mat-card-header>
        <mat-card-content class="list">
          @for (memory of memories.value(); track memory.day) {
            <button type="button" class="memory" (click)="dayOpen.emit(memory.day)">
              <span class="when">
                <span class="ago">
                  @if (yearsAgo(memory.day); as years) {
                    {{ 'diary.memories.yearsAgo' | transloco: { count: years } }}
                  } @else {
                    {{ 'diary.memories.monthAgo' | transloco }}
                  }
                </span>
                <span class="date">{{ memory.day | date: 'd MMM y' }}</span>
                @if (memory.mood) {
                  <span>{{ moodEmoji[memory.mood] }}</span>
                }
              </span>
              <span class="preview">{{ memory.preview }}</span>
            </button>
          }
        </mat-card-content>
      </mat-card>
    }
  `,
  styles: `
    .list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding-top: 12px;
    }
    .memory {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 10px 12px;
      border: 1px solid var(--pd-border);
      border-radius: 14px;
      background: none;
      color: inherit;
      text-align: left;
      font: inherit;
      cursor: pointer;
    }
    .memory:hover {
      border-color: color-mix(in srgb, var(--mat-sys-primary) 45%, var(--pd-border));
    }
    .when {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .ago {
      font: 700 0.72rem / 1 var(--pd-font);
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--mat-sys-primary);
    }
    .date {
      font: 0.8rem / 1 var(--pd-font);
      color: var(--mat-sys-on-surface-variant);
    }
    .preview {
      font: 0.85rem / 1.45 var(--pd-font);
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
  `,
})
export class DiaryMemoriesComponent {
  readonly day = input.required<LocalDate>();
  readonly dayOpen = output<LocalDate>();

  protected readonly moodEmoji = MOOD_EMOJI;
  protected readonly memories = inject(DiaryApi).memories(this.day);

  /** Years back for the same date; 0 for the "a month ago" entry (even across New Year). */
  protected yearsAgo(day: LocalDate): number {
    const current = parseLocalDate(this.day());
    const memory = parseLocalDate(day);
    const sameDate = current.month === memory.month && current.day === memory.day;
    return sameDate ? current.year - memory.year : 0;
  }
}
