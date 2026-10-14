import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { LabPoint, LabSeries } from '@pd/contracts';

const WIDTH = 600;
const HEIGHT = 180;

interface PlacedPoint extends LabPoint {
  /** Position in percent of the plot, for the HTML markers and the tooltip. */
  x: number;
  y: number;
}

/**
 * One analyte over the years: a 2px line in the theme's primary colour, the laboratory's own
 * range as a band behind it (each laboratory has its own, so the band follows the points), and
 * a marker for every result — a value out of its range is a square in the error colour, so it
 * is told by its shape too, not by the colour alone. Hover shows the date, the value, the range
 * and the laboratory; the table under the chart gives the same numbers.
 */
@Component({
  selector: 'pd-health-lab-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, DecimalPipe, TranslocoPipe],
  template: `
    @if (geometry(); as g) {
      <div class="chart">
        <div class="y-axis" aria-hidden="true">
          @for (tick of g.ticks; track tick.value) {
            <span [style.top.%]="tick.y">{{ tick.value | number: '1.0-2' }}</span>
          }
        </div>
        <div
          class="plot"
          (pointerleave)="hovered.set(null)"
          (pointermove)="hover($event, g.points)"
        >
          <svg
            [attr.viewBox]="'0 0 ' + width + ' ' + height"
            preserveAspectRatio="none"
            role="img"
            [attr.aria-label]="label()"
          >
            @for (tick of g.ticks; track tick.value) {
              <line
                class="grid"
                x1="0"
                [attr.x2]="width"
                [attr.y1]="(tick.y * height) / 100"
                [attr.y2]="(tick.y * height) / 100"
                vector-effect="non-scaling-stroke"
              />
            }
            @if (g.band) {
              <path class="band" [attr.d]="g.band" />
            }
            @if (g.high) {
              <path class="bound" [attr.d]="g.high" vector-effect="non-scaling-stroke" />
            }
            @if (g.low) {
              <path class="bound" [attr.d]="g.low" vector-effect="non-scaling-stroke" />
            }
            <path class="line" [attr.d]="g.line" vector-effect="non-scaling-stroke" />
          </svg>
          @for (point of g.points; track $index) {
            <span
              class="marker"
              [class.out]="point.flag"
              [class.active]="hovered() === $index"
              [style.left.%]="point.x"
              [style.top.%]="point.y"
            ></span>
          }
          @if (hoveredPoint(); as p) {
            <span class="tooltip" [class.right]="p.x > 60" [style.left.%]="p.x">
              <span>{{ p.day | date: 'd MMM y' }}</span>
              <b>{{ p.value | number: '1.0-3' }} {{ series().unit }}</b>
              @if (p.flag) {
                <span>{{ 'health.labs.flags.' + p.flag | transloco }}</span>
              }
              @if (p.low !== null || p.high !== null) {
                <span>
                  {{ 'health.labs.range' | transloco }}: {{ p.low ?? '…' }}–{{ p.high ?? '…' }}
                </span>
              }
              @if (p.laboratory) {
                <span>{{ p.laboratory }}</span>
              }
            </span>
          }
        </div>
        <div class="x-axis" aria-hidden="true">
          <span>{{ g.from | date: 'MMM y' }}</span>
          @if (g.to !== g.from) {
            <span>{{ g.to | date: 'MMM y' }}</span>
          }
        </div>
      </div>
    }
  `,
  styles: `
    .chart {
      display: grid;
      grid-template-columns: auto 1fr;
      grid-template-rows: 180px auto;
      column-gap: 8px;
    }
    .y-axis {
      position: relative;
      min-width: 32px;
    }
    .y-axis span,
    .x-axis span {
      font: var(--mat-sys-label-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .y-axis span {
      position: absolute;
      right: 0;
      transform: translateY(-50%);
    }
    .plot {
      position: relative;
      cursor: crosshair;
    }
    svg {
      display: block;
      width: 100%;
      height: 100%;
      overflow: visible;
    }
    .grid {
      stroke: var(--pd-border);
      stroke-width: 1px;
    }
    .band {
      fill: var(--mat-sys-primary);
      opacity: 0.1;
    }
    .bound {
      fill: none;
      stroke: var(--mat-sys-outline);
      stroke-width: 1px;
      stroke-dasharray: 4 4;
    }
    .line {
      fill: none;
      stroke: var(--mat-sys-primary);
      stroke-width: 2px;
      stroke-linejoin: round;
      stroke-linecap: round;
    }
    .marker {
      position: absolute;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--mat-sys-primary);
      box-shadow: 0 0 0 2px var(--mat-sys-surface);
      transform: translate(-50%, -50%);
      pointer-events: none;
    }
    .marker.out {
      width: 10px;
      height: 10px;
      border-radius: 2px;
      background: var(--mat-sys-error);
    }
    .marker.active {
      box-shadow:
        0 0 0 2px var(--mat-sys-surface),
        0 0 0 4px var(--mat-sys-on-surface);
    }
    .tooltip {
      position: absolute;
      bottom: calc(100% + 8px);
      transform: translateX(-50%);
      display: flex;
      flex-direction: column;
      padding: 6px 10px;
      border-radius: 8px;
      font: var(--mat-sys-label-small);
      white-space: nowrap;
      background: var(--mat-sys-inverse-surface);
      color: var(--mat-sys-inverse-on-surface);
      pointer-events: none;
      z-index: 1;
    }
    .tooltip.right {
      transform: translateX(-90%);
    }
    .x-axis {
      grid-column: 2;
      display: flex;
      justify-content: space-between;
      padding-top: 4px;
    }
  `,
})
export class LabChartComponent {
  readonly series = input.required<LabSeries>();
  /** For screen readers: what the chart is of. */
  readonly label = input('');

  protected readonly width = WIDTH;
  protected readonly height = HEIGHT;
  protected readonly hovered = signal<number | null>(null);

  protected readonly geometry = computed(() => chartGeometry(this.series().points));

  protected readonly hoveredPoint = computed(() => {
    const index = this.hovered();
    return index === null ? null : (this.geometry()?.points[index] ?? null);
  });

  /** The point nearest to the pointer along the time axis: a hit target wider than a marker. */
  protected hover(event: PointerEvent, points: PlacedPoint[]): void {
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * 100;
    let nearest = 0;
    points.forEach((point, index) => {
      if (Math.abs(point.x - x) < Math.abs(points[nearest].x - x)) {
        nearest = index;
      }
    });
    this.hovered.set(points.length ? nearest : null);
  }
}

/** Where everything goes, in the units of the viewBox (paths) and in percent (markers). */
function chartGeometry(points: readonly LabPoint[]) {
  if (!points.length) {
    return null;
  }
  const times = points.map((point) => Date.parse(point.day));
  const first = Math.min(...times);
  const last = Math.max(...times);
  const values = points.flatMap((point) =>
    [point.value, point.low, point.high].filter((value): value is number => value !== null),
  );
  const [min, max] = paddedRange(Math.min(...values), Math.max(...values));
  // A single day is put in the middle; a few days apart still spread over the width.
  const xOf = (time: number) => (last === first ? 50 : ((time - first) / (last - first)) * 100);
  const yOf = (value: number) => (1 - (value - min) / (max - min)) * 100;
  const placed: PlacedPoint[] = points.map((point, index) => ({
    ...point,
    x: xOf(times[index]),
    y: yOf(point.value),
  }));
  const toPath = (coords: [number, number][]) =>
    coords
      .map(([x, y], index) => `${index ? 'L' : 'M'}${(x * WIDTH) / 100},${(y * HEIGHT) / 100}`)
      .join(' ');
  const bound = (pick: (point: PlacedPoint) => number | null) => {
    const coords = placed
      .filter((point) => pick(point) !== null)
      .map((point) => [point.x, yOf(pick(point) as number)] as [number, number]);
    return coords.length ? toPath(widen(coords)) : null;
  };
  const both = placed.filter((point) => point.low !== null && point.high !== null);
  const upper = widen(both.map((p) => [p.x, yOf(p.high as number)] as [number, number]));
  const lower = widen(both.map((p) => [p.x, yOf(p.low as number)] as [number, number]));
  return {
    points: placed,
    line: toPath(placed.map((point) => [point.x, point.y])),
    band: both.length ? `${toPath([...upper, ...lower.reverse()])} Z` : null,
    high: bound((point) => point.high),
    low: bound((point) => point.low),
    ticks: [max, (min + max) / 2, min].map((value) => ({ value: round(value), y: yOf(value) })),
    from: new Date(first).toISOString().slice(0, 10),
    to: new Date(last).toISOString().slice(0, 10),
  };
}

/** A lone point of a bound still draws across the plot, so the range is seen. */
function widen(coords: [number, number][]): [number, number][] {
  return coords.length === 1
    ? [
        [0, coords[0][1]],
        [100, coords[0][1]],
      ]
    : coords;
}

/** A little room above and below; a flat series gets a range around its value. */
function paddedRange(min: number, max: number): [number, number] {
  if (min === max) {
    const room = Math.abs(min) * 0.1 || 1;
    return [min - room, max + room];
  }
  const room = (max - min) * 0.1;
  return [min - room, max + room];
}

function round(value: number): number {
  return Number(value.toPrecision(3));
}
