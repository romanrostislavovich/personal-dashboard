import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MusicTopItem } from '@pd/contracts';

/** Top 10: position, title, play count and a bar relative to the leader. */
@Component({
  selector: 'pd-top-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, TranslocoPipe],
  template: `
    <h3 class="title">{{ titleKey() | transloco }}</h3>
    <ol class="list">
      @for (item of rows(); track item.url; let i = $index) {
        <li class="row">
          <span class="rank">{{ i + 1 }}</span>
          @if (item.imageUrl) {
            <img class="thumb" [src]="item.imageUrl" alt="" loading="lazy" />
          }
          <div class="body">
            <div class="line">
              <a class="name" [href]="item.url" target="_blank" rel="noopener">{{ item.name }}</a>
              <span class="count" [title]="'music.plays' | transloco">{{
                item.playcount | number
              }}</span>
            </div>
            @if (item.artist) {
              <span class="artist">{{ item.artist }}</span>
            }
            <span class="bar" [style.width.%]="item.share"></span>
          </div>
        </li>
      } @empty {
        <li class="empty">{{ 'music.tops.empty' | transloco }}</li>
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
      align-items: center;
      gap: 10px;
      padding: 6px 0;
    }
    .rank {
      width: 20px;
      text-align: right;
      font: var(--mat-sys-label-medium);
      color: var(--mat-sys-on-surface-variant);
    }
    .thumb {
      width: 36px;
      height: 36px;
      border-radius: 4px;
      object-fit: cover;
    }
    .body {
      display: flex;
      flex-direction: column;
      gap: 2px;
      flex: 1;
      min-width: 0;
    }
    .line {
      display: flex;
      justify-content: space-between;
      gap: 8px;
    }
    .name {
      font: var(--mat-sys-body-medium);
      color: inherit;
      text-decoration: none;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .count {
      font: var(--mat-sys-label-medium);
      color: var(--mat-sys-on-surface-variant);
    }
    .artist {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .bar {
      height: 4px;
      border-radius: 0 4px 4px 0;
      background: var(--mat-sys-primary);
      opacity: 0.7;
    }
  `,
})
export class TopListComponent {
  readonly titleKey = input.required<string>();
  readonly items = input.required<MusicTopItem[]>();

  protected readonly rows = computed(() => {
    const items = this.items();
    const max = Math.max(1, ...items.map((item) => item.playcount));
    return items.map((item) => ({ ...item, share: (item.playcount / max) * 100 }));
  });
}
