import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import {TranslocoPipe, TranslocoService} from '@jsverse/transloco';
import {Correlation, CorrelationMetric} from '@pd/contracts';
import {formatValue} from './links-format';

const WIDTH = 520;
const HEIGHT = 320;
const PAD = {left: 64, right: 16, top: 12, bottom: 40};

interface Point {
  x: number;
  y: number;
  day: string;
}

/**
 * One pair day by day: a point for each day (its `a` across, `b` — of the same day or the
 * next — up), and the straight line that fits them best.
 */
@Component({
  selector: 'pd-correlation-scatter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe],
  template: `
    @if (chart(); as c) {
      <svg
        [attr.viewBox]="'0 0 ' + width + ' ' + height"
        role="img"
        [attr.aria-label]="c.title"
      >
        <line
          class="axis"
          [attr.x1]="pad.left"
          [attr.y1]="height - pad.bottom"
          [attr.x2]="width - pad.right"
          [attr.y2]="height - pad.bottom"
        />
        <line
          class="axis"
          [attr.x1]="pad.left"
          [attr.y1]="pad.top"
          [attr.x2]="pad.left"
          [attr.y2]="height - pad.bottom"
        />
        @for (tick of c.xTicks; track $index) {
          <text
            class="tick"
            [attr.x]="tick.at"
            [attr.y]="height - pad.bottom + 16"
            text-anchor="middle"
          >
            {{ tick.text }}
          </text>
        }
        @for (tick of c.yTicks; track $index) {
          <text
            class="tick"
            [attr.x]="pad.left - 6"
            [attr.y]="tick.at"
            text-anchor="end"
          >
            {{ tick.text }}
          </text>
        }
        @for (point of c.points; track point.day) {
          <circle class="point" [attr.cx]="point.x" [attr.cy]="point.y" r="3.5">
            <title>{{ point.day }}</title>
          </circle>
        }
        <line
          class="fit"
          [class.minus]="pair().rho < 0"
          [attr.x1]="c.fit.x1"
          [attr.y1]="c.fit.y1"
          [attr.x2]="c.fit.x2"
          [attr.y2]="c.fit.y2"
        />
        <text
          class="label"
          [attr.x]="(pad.left + width - pad.right) / 2"
          [attr.y]="height - 4"
          text-anchor="middle"
        >
          {{ name(a()) }}
        </text>
      </svg>
      <p class="y-label">
        ↑ {{ name(b()) }}
        @if (pair().lag) {
          ({{ 'life.links.nextDay' | transloco }})
        }
      </p>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    svg {
      display: block;
      width: 100%;
      max-width: 560px;
    }
    .axis {
      stroke: var(--mat-sys-outline-variant);
    }
    .tick,
    .label {
      font: 11px sans-serif;
      fill: var(--mat-sys-on-surface-variant);
    }
    .label {
      font-size: 12px;
      fill: var(--mat-sys-on-surface);
    }
    .point {
      fill: var(--mat-sys-primary);
      opacity: 0.45;
    }
    .fit {
      stroke: var(--mat-sys-primary);
      stroke-width: 2.5;
    }
    .fit.minus {
      stroke: var(--mat-sys-error);
    }
    .y-label {
      margin: 0 0 4px;
      font: var(--mat-sys-label-medium);
    }
  `,
})
export class CorrelationScatterComponent {
  readonly a = input.required<CorrelationMetric>();
  readonly b = input.required<CorrelationMetric>();
  readonly pair = input.required<Correlation>();

  private readonly transloco = inject(TranslocoService);
  protected readonly width = WIDTH;
  protected readonly height = HEIGHT;
  protected readonly pad = PAD;

  protected name(metric: CorrelationMetric): string {
    return metric.label ?? this.transloco.translate(metric.labelKey);
  }

  protected readonly chart = computed(() => {
    const [a, b, pair] = [this.a(), this.b(), this.pair()];
    const later = new Map(b.values.map(value => [value.day, value.value]));
    const raw: {x: number; y: number; day: string}[] = [];
    for (const {day, value} of a.values) {
      const y = later.get(pair.lag ? nextDay(day) : day);
      if (y !== undefined) {
        raw.push({x: value, y, day});
      }
    }
    if (!raw.length) {
      return null;
    }
    const xs = raw.map(point => point.x);
    const ys = raw.map(point => point.y);
    const [x0, x1] = range(xs);
    const [y0, y1] = range(ys);
    const sx = (x: number) =>
      PAD.left + ((x - x0) / (x1 - x0)) * (WIDTH - PAD.left - PAD.right);
    const sy = (y: number) =>
      HEIGHT -
      PAD.bottom -
      ((y - y0) / (y1 - y0)) * (HEIGHT - PAD.top - PAD.bottom);
    // Whole numbers (counts, a 1–5 mood) pile on each other: spread a little, the same each time.
    const spread = (index: number, scale: number) =>
      (((index * 7919) % 13) / 13 - 0.5) * scale;
    const points: Point[] = raw.map((point, index) => ({
      x: sx(point.x) + (Number.isInteger(point.x) ? spread(index, 8) : 0),
      y: sy(point.y) + (Number.isInteger(point.y) ? spread(index + 5, 8) : 0),
      day: point.day,
    }));
    const mx = xs.reduce((sum, x) => sum + x, 0) / xs.length;
    const my = ys.reduce((sum, y) => sum + y, 0) / ys.length;
    const fitAt = (x: number) => clamp(my + pair.slope * (x - mx), y0, y1);
    const locale = this.transloco.getActiveLang();
    const hours = (value: string) =>
      this.transloco.translate('life.hours', {value});
    const ticks = (
      metric: CorrelationMetric,
      [low, high]: number[],
      scale: (v: number) => number,
    ) =>
      [low, (low + high) / 2, high].map(value => ({
        at: scale(value),
        text: formatValue(metric, value, locale, hours),
      }));
    return {
      title: `${this.name(a)} — ${this.name(b)}`,
      points,
      xTicks: ticks(a, [x0, x1], sx),
      yTicks: ticks(b, [y0, y1], y => sy(y) + 4),
      fit: {x1: sx(x0), y1: sy(fitAt(x0)), x2: sx(x1), y2: sy(fitAt(x1))},
    };
  });
}

function range(values: number[]): [number, number] {
  const [low, high] = [Math.min(...values), Math.max(...values)];
  return low === high ? [low - 1, high + 1] : [low, high];
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function nextDay(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
