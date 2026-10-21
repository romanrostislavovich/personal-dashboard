import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { todayLocalDate } from '@pd/web-core';
import { lifelogMonthDays, lifelogMonthRange } from './lifelog-dates';
import { LifelogApi } from './lifelog.api';

@Component({
  selector: 'pd-lifelog-journal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, MatButtonModule, MatCardModule, RouterLink, TranslocoPipe],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-card-title>{{ 'life.chronicle.journal' | transloco }}</mat-card-title>
      </mat-card-header>
      <mat-card-content>
        <p class="hint">{{ 'life.chronicle.journalHint' | transloco }}</p>
        @if (entries.isLoading()) {
          <p role="status">{{ 'life.chronicle.loading' | transloco }}</p>
        } @else if (entries.error()) {
          <p role="alert">{{ 'life.chronicle.loadError' | transloco }}</p>
          <button matButton (click)="entries.reload()">{{ 'life.chronicle.retry' | transloco }}</button>
        } @else {
          <ol class="journal">
            @for (entry of days(); track entry.day) {
              <li>
                <a [routerLink]="['/life/chronicle']" [queryParams]="{ day: entry.day }">
                  <time [attr.datetime]="entry.day">{{ entry.day | date: 'd MMM' }}</time>
                  <span>{{ entry.narrative?.keyHighlight || entry.narrative?.summaryText || ('life.chronicle.missing' | transloco) }}</span>
                  @if (entry.narrative?.note) {
                    <small>{{ 'life.chronicle.hasNote' | transloco }}</small>
                  }
                </a>
              </li>
            }
          </ol>
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    .hint { color: var(--mat-sys-on-surface-variant); }
    .journal { list-style: none; padding: 0; }
    li + li { border-top: 1px solid var(--mat-sys-outline-variant); }
    a { display: grid; grid-template-columns: 80px 1fr; gap: 8px; padding: 12px 0; color: inherit; text-decoration: none; }
    a:hover, a:focus-visible { color: var(--mat-sys-primary); }
    span { overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow-wrap: anywhere; }
    small { grid-column: 2; color: var(--mat-sys-on-surface-variant); }
  `,
})
export class LifelogJournalComponent {
  readonly month = input.required<string>();
  protected readonly entries = inject(LifelogApi).list(() => lifelogMonthRange(this.month()));
  private readonly today = todayLocalDate();
  protected readonly days = computed(() => {
    const byDay = new Map(this.entries.value().map((entry) => [entry.day, entry]));
    return lifelogMonthDays(this.month()).filter((day) => day <= this.today)
      .map((day) => ({ day, narrative: byDay.get(day) }));
  });
}