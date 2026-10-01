import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export interface Share {
  name: string;
  value: number;
  /** The value as text: "12 h 5 min", "38%". */
  text: string;
  /** A colour of its own (GitHub's language colour); the theme colour otherwise. */
  color?: string | null;
}

/** A ranked list with proportional bars: languages, projects, editors. */
@Component({
  selector: 'pd-share-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul>
      @for (item of scaled(); track item.name) {
        <li>
          <span class="name">{{ item.name }}</span>
          <span class="text">{{ item.text }}</span>
          <span class="track">
            <span
              class="fill"
              [style.width.%]="item.percent"
              [style.background]="item.color"
            ></span>
          </span>
        </li>
      }
    </ul>
  `,
  styles: `
    ul {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    li {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 4px 12px;
      font: var(--mat-sys-body-medium);
    }
    .name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .text {
      color: var(--mat-sys-on-surface-variant);
      white-space: nowrap;
    }
    .track {
      grid-column: 1 / -1;
      height: 6px;
      border-radius: 3px;
      background: color-mix(in srgb, var(--mat-sys-on-surface) 8%, transparent);
    }
    .fill {
      display: block;
      height: 100%;
      min-width: 2px;
      border-radius: 3px;
      background: var(--mat-sys-primary);
    }
  `,
})
export class ShareListComponent {
  readonly items = input.required<Share[]>();

  /** Bars are relative to the first (largest) item, so small ones stay visible. */
  protected readonly scaled = computed(() => {
    const items = this.items();
    const max = Math.max(1, ...items.map((item) => item.value));
    return items.map((item) => ({ ...item, percent: (item.value / max) * 100 }));
  });
}
