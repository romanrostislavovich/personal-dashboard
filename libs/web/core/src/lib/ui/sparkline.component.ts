import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

export interface SparklinePoint {
  /** Дата (`YYYY-MM-DD`) или момент времени (ISO). */
  at: string;
  value: number;
}

const WIDTH = 240;
const HEIGHT = 48;
const PADDING = 5;

/**
 * Мини-график одного ряда (без осей и легенды — ряд называет подпись рядом).
 * Линия 2px в основном цвете темы; при наведении — маркер и подсказка «дата: значение».
 */
@Component({
  selector: 'pd-sparkline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, DecimalPipe],
  template: `
    @if (geometry(); as g) {
      <div class="wrap" (pointerleave)="hovered.set(null)">
        <svg
          [attr.viewBox]="'0 0 ' + width + ' ' + height"
          preserveAspectRatio="none"
          role="img"
          [attr.aria-label]="ariaLabel()"
          (pointermove)="onPointerMove($event)"
        >
          <path class="area" [attr.d]="g.area" />
          <path class="line" [attr.d]="g.line" vector-effect="non-scaling-stroke" />
        </svg>
        @if (hoveredPoint(); as p) {
          <span class="marker" [style.left.%]="p.xPercent" [style.top.%]="p.yPercent"></span>
          <span class="tooltip" [class.right]="p.xPercent > 60" [style.left.%]="p.xPercent">
            {{ p.at | date: dateFormat() }}: <b>{{ p.value | number }}</b
            >{{ unit() }}
          </span>
        }
      </div>
    } @else {
      <div class="empty">—</div>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .wrap {
      position: relative;
    }
    svg {
      display: block;
      width: 100%;
      height: 48px;
      overflow: visible;
      cursor: crosshair;
    }
    .line {
      fill: none;
      stroke: var(--mat-sys-primary);
      stroke-width: 2px;
      stroke-linejoin: round;
      stroke-linecap: round;
    }
    .area {
      fill: var(--mat-sys-primary);
      opacity: 0.08;
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
    .tooltip {
      position: absolute;
      bottom: calc(100% + 4px);
      transform: translateX(-50%);
      padding: 2px 8px;
      border-radius: 6px;
      font: var(--mat-sys-label-small);
      white-space: nowrap;
      background: var(--mat-sys-inverse-surface);
      color: var(--mat-sys-inverse-on-surface);
      pointer-events: none;
    }
    .tooltip.right {
      transform: translateX(-90%);
    }
    .empty {
      height: 48px;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class SparklineComponent {
  readonly points = input.required<SparklinePoint[]>();
  /** Описание для скринридеров, например «Звёзды за 30 дней». */
  readonly label = input('');
  /** Формат даты в подсказке (DatePipe): `d MMM` для дней, `HH:mm` для часов. */
  readonly dateFormat = input('d MMM');
  /** Единица после значения в подсказке, например ` мс`. */
  readonly unit = input('');

  protected readonly width = WIDTH;
  protected readonly height = HEIGHT;
  protected readonly hovered = signal<number | null>(null);

  /** Для графика нужно хотя бы две точки. */
  protected readonly geometry = computed(() => {
    const points = this.points();
    if (points.length < 2) {
      return null;
    }
    const values = points.map((p) => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const coords = points.map((p, i) => ({
      ...p,
      x: (i / (points.length - 1)) * WIDTH,
      y: HEIGHT - PADDING - ((p.value - min) / range) * (HEIGHT - PADDING * 2),
    }));
    const line = coords.map((c, i) => `${i ? 'L' : 'M'}${c.x},${c.y}`).join(' ');
    return { coords, line, area: `${line} L${WIDTH},${HEIGHT} L0,${HEIGHT} Z` };
  });

  protected readonly hoveredPoint = computed(() => {
    const index = this.hovered();
    const point = index === null ? null : this.geometry()?.coords[index];
    return point
      ? { ...point, xPercent: (point.x / WIDTH) * 100, yPercent: (point.y / HEIGHT) * 100 }
      : null;
  });

  protected readonly ariaLabel = computed(() => {
    const points = this.points();
    const last = points[points.length - 1];
    return last ? `${this.label()}: ${points[0].value} → ${last.value}` : this.label();
  });

  /** Подсвечиваем ближайшую по горизонтали точку — попасть курсором в линию не нужно. */
  protected onPointerMove(event: PointerEvent): void {
    const count = this.points().length;
    const rect = (event.currentTarget as SVGElement).getBoundingClientRect();
    const ratio = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
    this.hovered.set(Math.round(ratio * (count - 1)));
  }
}
