import {ChangeDetectionStrategy, Component, input} from '@angular/core';
import {TranslocoPipe} from '@jsverse/transloco';
import {MusicGenreShare} from '@pd/contracts';

/**
 * The genres of the period: each with its share of all the plays. A play counts for every genre
 * of its artist, so the shares add up to more than 100%.
 */
@Component({
  selector: 'pd-genre-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe],
  template: `
    <h3 class="title">{{ 'music.tops.genres' | transloco }}</h3>
    <ol class="list">
      @for (genre of genres(); track genre.name) {
        <li class="row" [title]="'music.tops.genreHint' | transloco">
          <div class="line">
            <span class="name">{{ genre.name }}</span>
            <span class="count">{{ genre.percent }}%</span>
          </div>
          <span class="bar" [style.width.%]="genre.percent"></span>
        </li>
      }
    </ol>
  `,
  styles: `
    .title {
      font: var(--mat-sys-title-small);
      margin: 0 0 8px;
    }
    .list {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .row {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 6px 0;
    }
    .line {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      font: var(--mat-sys-body-medium);
    }
    .count {
      font: var(--mat-sys-label-medium);
      color: var(--mat-sys-on-surface-variant);
    }
    .bar {
      height: 4px;
      border-radius: 0 4px 4px 0;
      background: var(--mat-sys-tertiary);
      opacity: 0.7;
    }
  `,
})
export class GenreListComponent {
  readonly genres = input.required<MusicGenreShare[]>();
}
