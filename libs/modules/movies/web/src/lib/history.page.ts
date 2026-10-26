import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { TranslocoPipe } from '@jsverse/transloco';
import { MovieTitle } from '@pd/contracts';
import { DurationPipe, EmptyStateComponent } from '@pd/web-core';
import { MoviesApi } from './movies.api';
import { TitleCardComponent } from './title-card.component';
import { TitleDialog } from './title.dialog';

/** Movies → History: every film and show watched, the newest first. */
@Component({
  selector: 'pd-movies-history',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe, DurationPipe, EmptyStateComponent, TitleCardComponent],
  template: `
    @if (titles.value().length) {
      <p class="summary">
        {{ 'movies.history.summary' | transloco: { films: films(), shows: shows() } }}
        · {{ seconds() | pdDuration }}
      </p>
      <div class="grid">
        @for (title of titles.value(); track title.id) {
          <pd-title-card [title]="title" (open)="open(title)" />
        }
      </div>
    } @else if (!titles.isLoading()) {
      <pd-empty-state
        icon="movie"
        [title]="'movies.history.empty.title' | transloco"
        [text]="'movies.history.empty.text' | transloco"
      />
    }
  `,
  styles: `
    .summary {
      color: var(--mat-sys-on-surface-variant);
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: 20px 16px;
    }
  `,
})
export class HistoryPage {
  private readonly dialog = inject(MatDialog);
  protected readonly titles = inject(MoviesApi).titles('history');

  protected readonly films = computed(
    () => this.titles.value().filter((title) => title.kind === 'movie').length,
  );
  protected readonly shows = computed(
    () => this.titles.value().filter((title) => title.kind === 'tv').length,
  );
  protected readonly seconds = computed(() =>
    this.titles.value().reduce((sum, title) => sum + title.watchedSeconds, 0),
  );

  open(title: MovieTitle): void {
    this.dialog
      .open(TitleDialog, { data: title, width: '520px', maxWidth: '95vw' })
      .afterClosed()
      .subscribe(() => this.titles.reload());
  }
}
