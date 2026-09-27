import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { DiaryInsights } from '@pd/contracts';
import { moodColor, MOOD_EMOJI } from './mood';

const TAGS_SHOWN = 5;

/**
 * Patterns in the diary: average mood per weekday (bars on a 1–5 scale)
 * and the tags with the best and worst average mood.
 */
@Component({
  selector: 'pd-diary-insights',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, TranslocoPipe],
  template: `
    @let data = insights();
    <div class="columns">
      <section>
        <h4 class="subtitle">{{ 'diary.insights.weekdays' | transloco }}</h4>
        @if (hasWeekdayData()) {
          <div class="bars">
            @for (d of data.moodByWeekday; track d.weekday) {
              <div class="bar-column" [title]="(d.average | number: '1.1-1') ?? ''">
                <span class="bar-value">
                  {{ d.average === null ? '—' : (d.average | number: '1.1-1') }}
                </span>
                <span class="bar-track">
                  @if (d.average !== null) {
                    <span
                      class="bar"
                      [style.height.%]="(d.average / 5) * 100"
                      [style.background]="color(d.average)"
                    ></span>
                  }
                </span>
                <span class="bar-label">
                  {{ 'diary.insights.weekdayNames.' + d.weekday | transloco }}
                </span>
              </div>
            }
          </div>
        } @else {
          <p class="muted">{{ 'diary.insights.notEnough' | transloco }}</p>
        }
      </section>

      <section>
        <h4 class="subtitle">{{ 'diary.insights.tags' | transloco }}</h4>
        @if (tags().length) {
          <ul class="tags">
            @for (t of tags(); track t.tag) {
              <li>
                <button type="button" class="tag" (click)="tagSelect.emit(t.tag)">
                  #{{ t.tag }}
                </button>
                <span class="meter">
                  <span
                    [style.width.%]="(t.average / 5) * 100"
                    [style.background]="color(t.average)"
                  ></span>
                </span>
                <span class="score">{{ emoji(t.average) }} {{ t.average | number: '1.1-1' }}</span>
              </li>
            }
          </ul>
          <p class="muted small">{{ 'diary.insights.tagsHint' | transloco }}</p>
        } @else {
          <p class="muted">{{ 'diary.insights.notEnough' | transloco }}</p>
        }
      </section>
    </div>
  `,
  styles: `
    :host {
      display: block;
      padding-top: 12px;
    }
    .columns {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 24px;
    }
    .subtitle {
      margin: 0 0 12px;
      font: 700 0.9rem / 1.3 var(--pd-font-heading);
    }
    .bars {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 8px;
      height: 150px;
    }
    .bar-column {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
    }
    .bar-value,
    .bar-label {
      font: 600 0.72rem / 1 var(--pd-font);
      color: var(--mat-sys-on-surface-variant);
    }
    .bar-track {
      position: relative;
      flex: 1;
      width: 100%;
      max-width: 28px;
      border-radius: 6px;
      background: color-mix(in srgb, var(--mat-sys-on-surface) 6%, transparent);
    }
    .bar {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      border-radius: 6px 6px 4px 4px;
    }
    .tags {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .tags li {
      display: grid;
      grid-template-columns: minmax(90px, auto) 1fr auto;
      align-items: center;
      gap: 10px;
    }
    .tag {
      padding: 0;
      border: 0;
      background: none;
      color: var(--mat-sys-primary);
      font: 600 0.85rem / 1.2 var(--pd-font);
      text-align: left;
      cursor: pointer;
    }
    .meter {
      height: 8px;
      border-radius: 4px;
      background: color-mix(in srgb, var(--mat-sys-on-surface) 6%, transparent);
      overflow: hidden;
    }
    .meter span {
      display: block;
      height: 100%;
      border-radius: inherit;
    }
    .score {
      font: 600 0.8rem / 1 var(--pd-font);
    }
    .muted {
      color: var(--mat-sys-on-surface-variant);
      font: 0.85rem / 1.4 var(--pd-font);
    }
    .small {
      font-size: 0.72rem;
      margin: 10px 0 0;
    }
  `,
})
export class DiaryInsightsComponent {
  readonly insights = input.required<DiaryInsights>();
  readonly tagSelect = output<string>();

  protected readonly hasWeekdayData = computed(() =>
    this.insights().moodByWeekday.some((d) => d.average !== null),
  );

  /** The best tags first, then the worst — the middle is the least interesting. */
  protected readonly tags = computed(() => {
    const all = this.insights().tagMoods;
    if (all.length <= TAGS_SHOWN * 2) {
      return all;
    }
    return [...all.slice(0, TAGS_SHOWN), ...all.slice(-TAGS_SHOWN)];
  });

  protected color(mood: number): string {
    return moodColor(mood);
  }

  protected emoji(mood: number): string {
    return MOOD_EMOJI[Math.min(5, Math.max(1, Math.round(mood)))];
  }
}
