import {DatePipe} from '@angular/common';
import {ChangeDetectionStrategy, Component, inject} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatDialog} from '@angular/material/dialog';
import {MatIconModule} from '@angular/material/icon';
import {ActivatedRoute} from '@angular/router';
import {TranslocoPipe} from '@jsverse/transloco';
import {MovieView} from '@pd/contracts';
import {DurationPipe, EmptyStateComponent} from '@pd/web-core';
import {firstValueFrom} from 'rxjs';
import {AssignDialog} from './assign.dialog';
import {MoviesApi} from './movies.api';

/**
 * Movies → Not found and Movies → Videos: single views as a list. One not found can be found by
 * hand, put aside as "not a film", or its site left alone from now on (its views go).
 */
@Component({
  selector: 'pd-movies-views',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    MatButtonModule,
    MatIconModule,
    TranslocoPipe,
    DurationPipe,
    EmptyStateComponent,
  ],
  template: `
    @if (kind === 'unknown') {
      <p class="hint">{{ 'movies.unknown.hint' | transloco }}</p>
    }
    @if (views.value().length) {
      <ul class="views">
        @for (view of views.value(); track view.id) {
          <li class="view">
            <div class="text">
              <span class="name">{{ view.name }}</span>
              <span class="line">
                {{ view.site }} · {{ view.startedAt | date: 'd MMM, HH:mm' }} ·
                {{ view.watchedSeconds | pdDuration }}
              </span>
            </div>
            @if (kind === 'unknown') {
              <div class="buttons">
                <button matButton="tonal" (click)="find(view)">
                  {{ 'movies.unknown.find' | transloco }}
                </button>
                <button matButton (click)="dismiss(view)">
                  {{ 'movies.unknown.notFilm' | transloco }}
                </button>
                <button matButton (click)="ignore(view)">
                  {{ 'movies.unknown.ignoreSite' | transloco }}
                </button>
              </div>
            }
          </li>
        }
      </ul>
    } @else if (!views.isLoading()) {
      <pd-empty-state
        [icon]="kind === 'unknown' ? 'task_alt' : 'smart_display'"
        [title]="'movies.' + kind + '.empty' | transloco"
      />
    }
  `,
  styles: `
    .hint,
    .line {
      color: var(--mat-sys-on-surface-variant);
    }
    .views {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .view {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 16px;
      padding: 10px 0;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }
    .text {
      flex: 1;
      min-width: 200px;
      display: flex;
      flex-direction: column;
    }
    .line {
      font: var(--mat-sys-body-small);
    }
    .buttons {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
  `,
})
export class ViewsPage {
  private readonly api = inject(MoviesApi);
  private readonly dialog = inject(MatDialog);
  protected readonly kind = inject(ActivatedRoute).snapshot.data['kind'] as
    'unknown' | 'video';
  protected readonly views = this.api.views(this.kind);

  find(view: MovieView): void {
    this.dialog
      .open(AssignDialog, {data: view, width: '560px', maxWidth: '95vw'})
      .afterClosed()
      .subscribe(() => this.views.reload());
  }

  async dismiss(view: MovieView): Promise<void> {
    await firstValueFrom(this.api.dismiss(view.id));
    this.views.reload();
  }

  async ignore(view: MovieView): Promise<void> {
    await firstValueFrom(this.api.ignoreSite(view.site));
    this.views.reload();
  }
}
