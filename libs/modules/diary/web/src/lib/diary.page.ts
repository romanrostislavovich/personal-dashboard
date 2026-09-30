import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import {
  addDays,
  DIARY_MARK_EMOJIS,
  diaryPlainText,
  DiaryEntry,
  DiarySettings,
  LocalDate,
  parseLocalDate,
  toLocalDate,
} from '@pd/contracts';
import { currentMonth, monthAsDate, monthRange, shiftMonth, todayLocalDate } from '@pd/web-core';
import { firstValueFrom } from 'rxjs';
import { DiaryApi } from './diary.api';
import { DiaryDeleteDialog } from './diary-delete.dialog';
import { DiaryEditorComponent } from './diary-editor.component';
import { DiaryHeatmapComponent } from './diary-heatmap.component';
import { DiaryInsightsComponent } from './diary-insights.component';
import { DiaryMemoriesComponent } from './diary-memories.component';
import { DiaryTemplateDialog } from './diary-template.dialog';
import { MOOD_EMOJI } from './mood';

const PREVIEW_LENGTH = 120;

/** What the left column shows: the month, search results or fragments with one mark. */
type Panel = 'month' | 'search' | 'marks';

@Component({
  selector: 'pd-diary-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatChipsModule,
    MatIconModule,
    MatSlideToggleModule,
    MatTooltipModule,
    TranslocoPipe,
    DiaryEditorComponent,
    DiaryHeatmapComponent,
    DiaryInsightsComponent,
    DiaryMemoriesComponent,
  ],
  templateUrl: './diary.page.html',
  styleUrl: './diary.page.scss',
})
export class DiaryPage {
  private readonly api = inject(DiaryApi);
  private readonly transloco = inject(TranslocoService);
  private readonly dialog = inject(MatDialog);
  private readonly editor = viewChild.required<DiaryEditorComponent>('editor');

  protected readonly moodEmoji = MOOD_EMOJI;
  protected readonly today = todayLocalDate();

  // --- Filters ---
  protected readonly month = signal(currentMonth());
  protected readonly tag = signal<string | null>(null);
  protected readonly query = signal('');
  protected readonly markEmoji = signal<string | null>(null);
  protected readonly year = signal(parseLocalDate(this.today).year);
  protected readonly monthDate = computed(() => monthAsDate(this.month()));

  protected readonly panel = computed<Panel>(() => {
    if (this.query().trim().length >= 2) {
      return 'search';
    }
    return this.markEmoji() ? 'marks' : 'month';
  });

  // --- Data ---
  protected readonly entries = this.api.entries(() => ({
    ...monthRange(this.month()),
    tag: this.tag() ?? undefined,
  }));
  protected readonly searchResults = this.api.search(this.query);
  protected readonly markHits = this.api.marks(this.markEmoji);
  protected readonly calendar = this.api.calendar(this.year);
  protected readonly insights = this.api.insights();
  protected readonly stats = this.api.stats();
  protected readonly settings = this.api.settings();
  /** The editor's palette plus any other emoji used in marks, with how often each is used. */
  protected readonly markFilters = computed(() => {
    const counts = new Map(
      (this.stats.value()?.topMarks ?? []).map(({ emoji, count }) => [emoji, count]),
    );
    const emojis = new Set([...DIARY_MARK_EMOJIS, ...counts.keys()]);
    return [...emojis].map((emoji) => ({ emoji, count: counts.get(emoji) ?? 0 }));
  });

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
    this.query.set('');
    this.markEmoji.set(null);
  }

  toggleMark(emoji: string): void {
    this.markEmoji.update((current) => (current === emoji ? null : emoji));
    this.query.set('');
  }

  /** Opens a day; the editor saves what was typed for the previous one by itself. */
  selectDay(day: LocalDate): void {
    this.selectedDay.set(day);
    const { year, month } = parseLocalDate(day);
    const current = this.month();
    if (current.year !== year || current.month !== month) {
      this.month.set({ year, month });
    }
  }

  onSaved(): void {
    this.entries.reload();
    this.stats.reload();
    this.calendar.reload();
    this.insights.reload();
    if (this.markEmoji()) {
      this.markHits.reload();
    }
  }

  /** Changes one setting and keeps the others as they are. */
  async updateSettings(change: Partial<DiarySettings>): Promise<void> {
    const current = this.settings.value() ?? {
      eveningReminder: false,
      weeklySummary: false,
      template: null,
    };
    await firstValueFrom(this.api.saveSettings({ ...current, ...change }));
    this.settings.reload();
  }

  /** From the list: the open day goes through the editor, which also drops its unsaved text. */
  async deleteEntry(day: LocalDate): Promise<void> {
    if (day === this.selectedDay()) {
      await this.editor().remove();
      return;
    }
    if (confirm(this.transloco.translate('diary.editor.confirmDelete'))) {
      await firstValueFrom(this.api.remove(day));
      this.onSaved();
    }
  }

  async deleteAll(): Promise<void> {
    const confirmed = await firstValueFrom(
      this.dialog.open<DiaryDeleteDialog, void, boolean>(DiaryDeleteDialog).afterClosed(),
    );
    if (!confirmed) {
      return;
    }
    await firstValueFrom(this.api.removeAll());
    this.editor().reload();
    this.onSaved();
  }

  async editTemplate(): Promise<void> {
    const text = await firstValueFrom(
      this.dialog
        .open<DiaryTemplateDialog, string | null, string>(DiaryTemplateDialog, {
          data: this.settings.value()?.template ?? null,
        })
        .afterClosed(),
    );
    if (text !== undefined) {
      await this.updateSettings({ template: text.trim() || null });
    }
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
    const plain = diaryPlainText(entry.content);
    return plain.length > PREVIEW_LENGTH ? `${plain.slice(0, PREVIEW_LENGTH)}…` : plain;
  }

  /** Splits a snippet around the search query so the match can be highlighted. */
  protected highlight(snippet: string): { text: string; match: boolean }[] {
    const query = this.query().trim();
    if (!query) {
      return [{ text: snippet, match: false }];
    }
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return snippet
      .split(new RegExp(`(${escaped})`, 'gi'))
      .filter(Boolean)
      .map((text) => ({ text, match: text.toLowerCase() === query.toLowerCase() }));
  }
}

function lastWeek(today: LocalDate): { from: LocalDate; to: LocalDate } {
  return { from: toLocalDate(addDays(parseLocalDate(today), -6)), to: today };
}
