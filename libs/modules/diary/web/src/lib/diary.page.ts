import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import {
  addDays,
  DiaryEntry,
  DiarySettings,
  LocalDate,
  parseLocalDate,
  toLocalDate,
} from '@pd/contracts';
import { currentMonth, monthAsDate, monthRange, shiftMonth, todayLocalDate } from '@pd/web-core';
import { firstValueFrom } from 'rxjs';
import { DiaryApi } from './diary.api';
import { DiaryEditorComponent } from './diary-editor.component';
import { MOOD_EMOJI } from './mood';

const PREVIEW_LENGTH = 120;

@Component({
  selector: 'pd-diary-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    MatCardModule,
    MatButtonModule,
    MatChipsModule,
    MatIconModule,
    MatSlideToggleModule,
    TranslocoPipe,
    DiaryEditorComponent,
  ],
  templateUrl: './diary.page.html',
  styleUrl: './diary.page.scss',
})
export class DiaryPage {
  private readonly api = inject(DiaryApi);
  private readonly transloco = inject(TranslocoService);
  private readonly editor = viewChild(DiaryEditorComponent);

  protected readonly moodEmoji = MOOD_EMOJI;
  protected readonly today = todayLocalDate();

  // --- List filters ---
  protected readonly month = signal(currentMonth());
  protected readonly tag = signal<string | null>(null);
  protected readonly monthDate = computed(() => monthAsDate(this.month()));

  // --- Data ---
  protected readonly entries = this.api.entries(() => ({
    ...monthRange(this.month()),
    tag: this.tag() ?? undefined,
  }));
  protected readonly stats = this.api.stats();
  protected readonly settings = this.api.settings();

  protected readonly selectedDay = signal<LocalDate>(this.today);
  protected readonly summary = signal<{
    loading: boolean;
    text: string | null;
    error: boolean;
  } | null>(null);

  shiftMonth(delta: number): void {
    this.month.update((month) => shiftMonth(month, delta));
  }

  toggleTag(tag: string): void {
    this.tag.update((current) => (current === tag ? null : tag));
  }

  /** Switches the day; unsaved changes are not lost silently. */
  selectDay(day: LocalDate): void {
    if (day === this.selectedDay()) {
      return;
    }
    if (this.editor()?.dirty() && !confirm(this.transloco.translate('diary.unsavedConfirm'))) {
      return;
    }
    this.selectedDay.set(day);
  }

  onSaved(): void {
    this.entries.reload();
    this.stats.reload();
  }

  /** Changes one setting and keeps the others as they are. */
  async updateSettings(change: Partial<DiarySettings>): Promise<void> {
    const current = this.settings.value() ?? { eveningReminder: false, weeklySummary: false };
    await firstValueFrom(this.api.saveSettings({ ...current, ...change }));
    this.settings.reload();
  }

  /** AI summary of the last 7 days (requires a configured AI). */
  async summarizeWeek(): Promise<void> {
    this.summary.set({ loading: true, text: null, error: false });
    try {
      const { summary } = await firstValueFrom(this.api.summarize(lastWeek(this.today)));
      this.summary.set({
        loading: false,
        text: summary ?? this.transloco.translate('diary.summary.noEntries'),
        error: false,
      });
    } catch {
      this.summary.set({
        loading: false,
        text: this.transloco.translate('diary.summary.error'),
        error: true,
      });
    }
  }

  protected preview(entry: DiaryEntry): string {
    // Strip markdown so the list shows plain text.
    const plain = entry.content
      .replace(/[#*_`>[\]()-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return plain.length > PREVIEW_LENGTH ? `${plain.slice(0, PREVIEW_LENGTH)}…` : plain;
  }
}

function lastWeek(today: LocalDate): { from: LocalDate; to: LocalDate } {
  return { from: toLocalDate(addDays(parseLocalDate(today), -6)), to: today };
}
