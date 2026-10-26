import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import { MovieTitle } from '@pd/contracts';
import { DurationPipe } from '@pd/web-core';

/** A film or a show as a card: the poster, the title, what was seen of it, the rating. */
@Component({
  selector: 'pd-title-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, MatIconModule, TranslocoPipe, DurationPipe],
  template: `
    @let t = title();
    <button type="button" class="card" (click)="open.emit()">
      @if (t.posterUrl) {
        <img class="poster" [src]="t.posterUrl" [alt]="t.title" loading="lazy" />
      } @else {
        <div class="poster empty">
          <mat-icon>{{ t.kind === 'tv' ? 'tv' : 'movie' }}</mat-icon>
        </div>
      }
      <span class="name">{{ t.title }}</span>
      <span class="line">
        {{ t.year ?? '' }}
        @if (t.kind === 'tv') {
          · {{ 'movies.show' | transloco }}
        }
      </span>
      @if (t.lastEpisode) {
        <span class="line"
          >{{ 'movies.lastEpisode' | transloco: t.lastEpisode }} ·
          {{ 'movies.episodes' | transloco: { count: t.episodes } }}</span
        >
      }
      @if (t.watchedOn) {
        <span class="line seen">
          <mat-icon inline>check_circle</mat-icon> {{ t.watchedOn | date: 'd MMM y' }}
        </span>
      } @else if (t.watchedSeconds) {
        <span class="line">{{ t.watchedSeconds | pdDuration }}</span>
      }
      @if (t.rating) {
        <span class="rating"><mat-icon inline>star</mat-icon> {{ t.rating }}/10</span>
      }
    </button>
  `,
  styles: `
    .card {
      display: flex;
      flex-direction: column;
      gap: 2px;
      width: 100%;
      padding: 0;
      border: none;
      background: none;
      color: inherit;
      text-align: left;
      font: inherit;
      cursor: pointer;
    }
    .poster {
      width: 100%;
      aspect-ratio: 2 / 3;
      object-fit: cover;
      border-radius: 12px;
      background: var(--mat-sys-surface-container-high);
    }
    .empty {
      display: grid;
      place-items: center;
      color: var(--mat-sys-on-surface-variant);
    }
    .name {
      margin-top: 6px;
      font: var(--mat-sys-title-small);
    }
    .line {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .seen {
      color: var(--mat-sys-primary);
    }
    .rating {
      font: var(--mat-sys-label-large);
    }
  `,
})
export class TitleCardComponent {
  readonly title = input.required<MovieTitle>();
  readonly open = output<void>();
}
