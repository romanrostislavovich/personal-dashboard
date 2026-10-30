import {DecimalPipe} from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import {MatCardModule} from '@angular/material/card';
import {TranslocoPipe} from '@jsverse/transloco';
import {BandDayDetail, SleepStage, WearableDay} from '@pd/contracts';
import {clock} from './band-format';

/** The rows of the chart, top to bottom; "asleep" (a band without stages) goes with light. */
const ROWS: SleepStage[] = ['awake', 'rem', 'light', 'deep'];
const ROW_OF: Record<SleepStage, number> = {
  awake: 0,
  rem: 1,
  light: 2,
  asleep: 2,
  deep: 3,
  out: 0,
};
const WIDTH = 1000;
const ROW = 22;

/**
 * The night that ended the day: its stages through the night (a hypnogram), the score, and HRV,
 * the resting pulse and the skin's temperature against the owner's own baselines.
 */
@Component({
  selector: 'pd-band-night',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, MatCardModule, TranslocoPipe],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-card-title>{{
          'health.band.night.title' | transloco
        }}</mat-card-title>
        @if (detail().sleep; as sleep) {
          <mat-card-subtitle
            >{{ clock(sleep.startAt) }} –
            {{ clock(sleep.endAt) }}</mat-card-subtitle
          >
        }
      </mat-card-header>
      <mat-card-content>
        @if (detail().sleep) {
          <!-- The labels in HTML: inside the SVG they would grow and shrink with its width. -->
          <div class="hypnogram">
            <div class="labels">
              @for (row of rows; track row) {
                <span>{{ 'health.band.stages.' + row | transloco }}</span>
              }
            </div>
            <svg
              [attr.viewBox]="'0 0 ' + width + ' ' + height"
              preserveAspectRatio="none"
              role="img"
              [attr.aria-label]="'health.band.night.stages' | transloco"
            >
              @for (block of blocks(); track block.x) {
                <rect
                  [attr.class]="'stage ' + block.stage"
                  [attr.x]="block.x"
                  [attr.y]="block.y"
                  [attr.width]="block.w"
                  [attr.height]="rowHeight - 4"
                >
                  <title>{{ block.title }}</title>
                </rect>
              }
            </svg>
          </div>
        } @else {
          <p class="hint">{{ 'health.band.night.none' | transloco }}</p>
        }
        @if (day(); as d) {
          <dl class="numbers">
            @if (d.sleepScore !== null) {
              <div>
                <dt>{{ 'health.band.fields.sleepScore' | transloco }}</dt>
                <dd>{{ d.sleepScore }} / 100</dd>
              </div>
            }
            @if (d.sleepMinutes !== null) {
              <div>
                <dt>{{ 'health.band.fields.sleepMinutes' | transloco }}</dt>
                <dd>
                  {{ d.sleepMinutes / 60 | number: '1.1-1' }}
                  {{ 'health.band.h' | transloco }}
                </dd>
              </div>
            }
            @if (d.hrvMs !== null) {
              <div>
                <dt>{{ 'health.band.fields.hrvMs' | transloco }}</dt>
                <dd>
                  {{ d.hrvMs | number: '1.0-0' }} ms
                  @if (detail().baseline.hrvMs; as base) {
                    <span class="base">{{
                      'health.band.night.usual'
                        | transloco: {value: (base | number: '1.0-0')}
                    }}</span>
                  }
                </dd>
              </div>
            }
            @if (d.restingHeartRate !== null) {
              <div>
                <dt>{{ 'health.band.fields.restingHeartRate' | transloco }}</dt>
                <dd>
                  {{ d.restingHeartRate }} bpm
                  @if (detail().baseline.restingHeartRate; as base) {
                    <span class="base">{{
                      'health.band.night.usual'
                        | transloco: {value: (base | number: '1.0-0')}
                    }}</span>
                  }
                </dd>
              </div>
            }
            @if (d.skinTempDelta !== null) {
              <div>
                <dt>{{ 'health.band.fields.skinTempDelta' | transloco }}</dt>
                <dd>
                  {{ d.skinTempDelta > 0 ? '+' : ''
                  }}{{ d.skinTempDelta | number: '1.1-2' }} °C
                </dd>
              </div>
            }
          </dl>
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    .hypnogram {
      display: flex;
      gap: 8px;
    }
    .labels {
      display: flex;
      flex-direction: column;
      font: var(--mat-sys-label-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .labels span {
      height: 22px;
      line-height: 22px;
    }
    svg {
      flex: 1;
      min-width: 0;
      height: 88px;
    }
    .stage.deep {
      fill: var(--mat-sys-primary);
    }
    .stage.light,
    .stage.asleep {
      fill: color-mix(in srgb, var(--mat-sys-primary) 55%, transparent);
    }
    .stage.rem {
      fill: var(--mat-sys-tertiary);
    }
    .stage.awake,
    .stage.out {
      fill: var(--mat-sys-error);
    }
    .hint,
    .base,
    dt {
      color: var(--mat-sys-on-surface-variant);
    }
    .numbers {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: 8px 16px;
      margin: 12px 0 0;
    }
    dt {
      font: var(--mat-sys-label-medium);
    }
    dd {
      margin: 0;
      font: 600 1.05rem / 1.3 var(--pd-font-heading);
    }
    .base {
      display: block;
      font: var(--mat-sys-label-small);
    }
  `,
})
export class BandNightComponent {
  readonly detail = input.required<BandDayDetail>();
  readonly day = input<WearableDay | null>(null);

  protected readonly rows = ROWS;
  protected readonly rowHeight = ROW;
  protected readonly width = WIDTH;
  protected readonly height = ROWS.length * ROW;
  protected readonly clock = clock;

  /** Each stage as a block in its row, across the night. */
  protected readonly blocks = computed(() => {
    const sleep = this.detail().sleep;
    if (!sleep) {
      return [];
    }
    const start = Date.parse(sleep.startAt);
    const span = Date.parse(sleep.endAt) - start || 1;
    const scale = WIDTH / span;
    return sleep.stages.map(stage => {
      const from = Date.parse(stage.startAt);
      return {
        stage: stage.stage,
        x: (from - start) * scale,
        y: ROW_OF[stage.stage] * ROW + 2,
        w: Math.max(1, (Date.parse(stage.endAt) - from) * scale),
        title: `${clock(stage.startAt)}–${clock(stage.endAt)}`,
      };
    });
  });
}
