import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TranslocoPipe } from '@jsverse/transloco';
import { MovieSearchResult } from '@pd/contracts';
import { catchError, debounceTime, distinctUntilChanged, of, switchMap, tap } from 'rxjs';
import { MoviesApi } from './movies.api';

/** Waits this long after the last key before asking TMDB. */
const DEBOUNCE_MS = 400;

/**
 * A field that finds films and shows in TMDB as one types. What to do with a result is the
 * parent's: it names the buttons (`actions`) and gets `picked` with the result and the button.
 */
@Component({
  selector: 'pd-movie-search',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatFormFieldModule, MatIconModule, MatInputModule, MatProgressBarModule, TranslocoPipe],
  template: `
    <mat-form-field class="field" subscriptSizing="dynamic">
      <mat-icon matPrefix>search</mat-icon>
      <mat-label>{{ 'movies.search.label' | transloco }}</mat-label>
      <input
        matInput
        [value]="query()"
        (input)="query.set($any($event.target).value)"
        autocomplete="off"
      />
    </mat-form-field>
    @if (busy()) {
      <mat-progress-bar mode="indeterminate" />
    }
    @if (failed()) {
      <p class="error">{{ 'movies.search.failed' | transloco }}</p>
    }
    <ul class="results">
      @for (result of results(); track result.kind + result.tmdbId) {
        <li class="result">
          @if (result.posterUrl) {
            <img class="poster" [src]="result.posterUrl" alt="" loading="lazy" />
          } @else {
            <div class="poster">
              <mat-icon>{{ result.kind === 'tv' ? 'tv' : 'movie' }}</mat-icon>
            </div>
          }
          <div class="text">
            <span class="name">{{ result.title }}</span>
            <span class="line">
              {{ result.year ?? '' }}
              · {{ (result.kind === 'tv' ? 'movies.show' : 'movies.film') | transloco }}
              @if (result.originalTitle) {
                · {{ result.originalTitle }}
              }
            </span>
          </div>
          <div class="buttons">
            @for (action of actions(); track action.id) {
              <button
                type="button"
                class="action"
                [attr.aria-label]="action.labelKey | transloco"
                [title]="action.labelKey | transloco"
                (click)="picked.emit({ result, action: action.id })"
              >
                <mat-icon>{{ action.icon }}</mat-icon>
              </button>
            }
          </div>
        </li>
      }
    </ul>
  `,
  styles: `
    .field {
      width: 100%;
    }
    .error {
      color: var(--mat-sys-error);
    }
    .results {
      margin: 8px 0 0;
      padding: 0;
      list-style: none;
    }
    .result {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 6px 0;
    }
    .poster {
      flex: none;
      display: grid;
      place-items: center;
      width: 40px;
      height: 60px;
      object-fit: cover;
      border-radius: 6px;
      background: var(--mat-sys-surface-container-high);
    }
    .text {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .line {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .buttons {
      display: flex;
      gap: 4px;
    }
    .action {
      display: grid;
      place-items: center;
      width: 40px;
      height: 40px;
      border: none;
      border-radius: 50%;
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
      cursor: pointer;
    }
  `,
})
export class MovieSearchComponent implements OnInit {
  private readonly api = inject(MoviesApi);

  /** The buttons of each result. */
  readonly actions = input.required<{ id: string; icon: string; labelKey: string }[]>();
  /** Text to search for at once (the name a page gave). */
  readonly initial = input('');
  readonly picked = output<{ result: MovieSearchResult; action: string }>();

  protected readonly query = signal('');
  protected readonly results = signal<MovieSearchResult[]>([]);
  protected readonly busy = signal(false);
  protected readonly failed = signal(false);

  constructor() {
    toObservable(this.query)
      .pipe(
        debounceTime(DEBOUNCE_MS),
        distinctUntilChanged(),
        tap(() => this.failed.set(false)),
        switchMap((text) => {
          if (text.trim().length < 2) {
            return of([]);
          }
          this.busy.set(true);
          return this.api.search(text.trim()).pipe(
            catchError(() => {
              this.failed.set(true);
              return of([]);
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((results) => {
        this.busy.set(false);
        this.results.set(results);
      });
  }

  ngOnInit(): void {
    if (this.initial()) {
      this.query.set(this.initial());
    }
  }
}
