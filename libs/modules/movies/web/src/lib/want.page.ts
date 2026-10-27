import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { MovieSearchResult, MovieTitle } from '@pd/contracts';
import { EmptyStateComponent } from '@pd/web-core';
import { firstValueFrom } from 'rxjs';
import { MovieSearchComponent } from './movie-search.component';
import { MoviesApi } from './movies.api';
import { TitleCardComponent } from './title-card.component';
import { TitleDialog } from './title.dialog';

const ACTIONS = [
  { id: 'want', icon: 'bookmark_add', labelKey: 'movies.want.add' },
  { id: 'seen', icon: 'check', labelKey: 'movies.want.seen' },
];

/** Movies → To watch: a search in TMDB, and the list. */
@Component({
  selector: 'pd-movies-want',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe, EmptyStateComponent, MovieSearchComponent, TitleCardComponent],
  template: `
    @if (status.value()?.tmdb) {
      <pd-movie-search
        [actions]="actions"
        [initial]="initial"
        (picked)="add($event.result, $event.action)"
      />
    }

    <h2 class="heading">{{ 'movies.want.list' | transloco }}</h2>
    @if (titles.value().length) {
      <div class="grid">
        @for (title of titles.value(); track title.id) {
          <pd-title-card [title]="title" (open)="open(title)" />
        }
      </div>
    } @else if (!titles.isLoading()) {
      <pd-empty-state
        icon="bookmark"
        [title]="'movies.want.empty.title' | transloco"
        [text]="'movies.want.empty.text' | transloco"
      />
    }
  `,
  styles: `
    .heading {
      margin: 24px 0 12px;
      font: var(--mat-sys-title-medium);
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: 20px 16px;
    }
  `,
})
export class WantPage {
  private readonly api = inject(MoviesApi);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly transloco = inject(TranslocoService);
  /** A film shared from another app (`?q=`, movies.commands.ts): searched at once. */
  protected readonly initial = inject(ActivatedRoute).snapshot.queryParamMap.get('q') ?? '';

  protected readonly actions = ACTIONS;
  protected readonly status = this.api.status();
  protected readonly titles = this.api.titles('want');

  async add(result: MovieSearchResult, action: string): Promise<void> {
    try {
      const title = await firstValueFrom(
        this.api.add({ tmdbId: result.tmdbId, kind: result.kind, wanted: action === 'want' }),
      );
      const key = action === 'want' ? 'movies.want.added' : 'movies.want.markedSeen';
      this.snackBar.open(this.transloco.translate(key, { title: title.title }), 'OK', {
        duration: 4000,
      });
      this.titles.reload();
    } catch {
      this.snackBar.open(this.transloco.translate('movies.errors.generic'), 'OK', {
        duration: 6000,
      });
    }
  }

  open(title: MovieTitle): void {
    this.dialog
      .open(TitleDialog, { data: title, width: '520px', maxWidth: '95vw' })
      .afterClosed()
      .subscribe(() => this.titles.reload());
  }
}
