import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Correlation, CorrelationMetric } from '@pd/contracts';
import { moduleColor, SelectedPair } from './links-format';

const SIZE = 520;
const CENTER = SIZE / 2;
const RADIUS = 150;
const LABEL_GAP = 12;

interface Node {
  metric: CorrelationMetric;
  x: number;
  y: number;
  /** Where its label goes: outside the circle, on the node's side. */
  labelX: number;
  labelY: number;
  anchor: 'start' | 'end';
  color: string;
  links: number;
}

interface Edge {
  pair: Correlation;
  path: string;
  width: number;
}

/**
 * The strong links as a graph: the numbers on a circle, grouped by section; a line of the same
 * day, an arrow from a day to the next one. Its colour: together (primary) or against (error);
 * its width: how strong. A number in focus lights up its own links.
 */
@Component({
  selector: 'pd-correlation-graph',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe],
  template: `
    <svg
      [attr.viewBox]="'0 0 ' + size + ' ' + size"
      role="img"
      [attr.aria-label]="'life.links.graph.title' | transloco"
      (pointerleave)="hovered.set(null)"
    >
      <defs>
        <marker
          id="pd-arrow-plus"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L10,5 L0,10 z" class="plus" />
        </marker>
        <marker
          id="pd-arrow-minus"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L10,5 L0,10 z" class="minus" />
        </marker>
      </defs>
      @for (edge of edges(); track edge.pair.a + edge.pair.b + edge.pair.lag) {
        <path
          class="edge"
          [class.plus]="edge.pair.rho > 0"
          [class.minus]="edge.pair.rho < 0"
          [class.dim]="dimmed(edge.pair)"
          [attr.d]="edge.path"
          [attr.stroke-width]="edge.width"
          [attr.marker-end]="
            edge.pair.lag
              ? edge.pair.rho > 0
                ? 'url(#pd-arrow-plus)'
                : 'url(#pd-arrow-minus)'
              : null
          "
          (click)="pick.emit({ a: edge.pair.a, b: edge.pair.b, lag: edge.pair.lag })"
        >
          <title>{{ edge.pair.rho }}</title>
        </path>
      }
      @for (node of nodes(); track node.metric.key) {
        <g
          class="node"
          [class.dim]="hovered() && !near(node.metric.key)"
          [class.chosen]="node.metric.key === target()"
          tabindex="0"
          role="button"
          (pointerenter)="hovered.set(node.metric.key)"
          (focus)="hovered.set(node.metric.key)"
          (click)="choose.emit(node.metric.key)"
          (keydown.enter)="choose.emit(node.metric.key)"
        >
          <circle
            [attr.cx]="node.x"
            [attr.cy]="node.y"
            [attr.r]="5 + node.links"
            [attr.fill]="node.color"
          />
          <text [attr.x]="node.labelX" [attr.y]="node.labelY" [attr.text-anchor]="node.anchor">
            {{ short(node.metric.label ?? (node.metric.labelKey | transloco)) }}
          </text>
        </g>
      }
    </svg>
  `,
  styles: `
    :host {
      display: block;
    }
    svg {
      display: block;
      width: 100%;
      max-width: 600px;
      margin: 0 auto;
      overflow: visible;
    }
    .edge {
      fill: none;
      opacity: 0.75;
      cursor: pointer;
      transition: opacity 0.15s;
    }
    .edge.plus,
    path.plus {
      stroke: var(--mat-sys-primary);
      fill: var(--mat-sys-primary);
    }
    .edge.minus,
    path.minus {
      stroke: var(--mat-sys-error);
      fill: var(--mat-sys-error);
    }
    .edge.plus,
    .edge.minus {
      fill: none;
    }
    .dim {
      opacity: 0.12;
    }
    .node {
      cursor: pointer;
      outline: none;
      transition: opacity 0.15s;
    }
    .node text {
      font: 14px var(--mat-sys-body-small-font, sans-serif);
      fill: var(--mat-sys-on-surface);
      dominant-baseline: middle;
    }
    .node.chosen text {
      font-weight: 700;
    }
    .node circle {
      stroke: var(--mat-sys-surface);
      stroke-width: 2;
    }
    .node:focus-visible circle,
    .node.chosen circle {
      stroke: var(--mat-sys-on-surface);
    }
  `,
})
export class CorrelationGraphComponent {
  readonly metrics = input.required<CorrelationMetric[]>();
  /** The strong links only. */
  readonly links = input.required<Correlation[]>();
  /** The number the regression explains: marked. */
  readonly target = input<string | null>(null);
  readonly choose = output<string>();
  readonly pick = output<SelectedPair>();

  protected readonly size = SIZE;
  protected readonly hovered = signal<string | null>(null);

  protected readonly nodes = computed<Node[]>(() => {
    const linked = new Map<string, number>();
    for (const pair of this.links()) {
      linked.set(pair.a, (linked.get(pair.a) ?? 0) + 1);
      linked.set(pair.b, (linked.get(pair.b) ?? 0) + 1);
    }
    // Only the numbers that have a link: the rest would only crowd the circle.
    const shown = this.metrics()
      .filter((metric) => linked.has(metric.key))
      .sort((a, b) => a.module.localeCompare(b.module) || a.key.localeCompare(b.key));
    return shown.map((metric, index) => {
      const angle = (index / shown.length) * 2 * Math.PI - Math.PI / 2;
      const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
      return {
        metric,
        x: CENTER + RADIUS * cos,
        y: CENTER + RADIUS * sin,
        labelX: CENTER + (RADIUS + LABEL_GAP) * cos,
        labelY: CENTER + (RADIUS + LABEL_GAP) * sin,
        anchor: cos >= 0 ? 'start' : 'end',
        color: moduleColor(metric.module),
        links: Math.min(6, linked.get(metric.key) ?? 0),
      };
    });
  });

  protected readonly edges = computed<Edge[]>(() => {
    const at = new Map(this.nodes().map((node) => [node.metric.key, node]));
    return this.links().flatMap((pair) => {
      const [from, to] = [at.get(pair.a), at.get(pair.b)];
      if (!from || !to) {
        return [];
      }
      // A day to the next bends toward the middle; the same day goes straight.
      const bend = pair.lag ? 0.55 : 1;
      const cx = CENTER + ((from.x + to.x) / 2 - CENTER) * bend;
      const cy = CENTER + ((from.y + to.y) / 2 - CENTER) * bend;
      // The arrow stops at the edge of the node it points to.
      const end = toward(to, { x: cx, y: cy }, pair.lag ? 6 + to.links : 0);
      return [
        {
          pair,
          path: `M${from.x},${from.y} Q${cx},${cy} ${end.x},${end.y}`,
          width: 1 + Math.abs(pair.rho) * 5,
        },
      ];
    });
  });

  protected near(key: string): boolean {
    const hovered = this.hovered();
    return (
      key === hovered ||
      this.links().some(
        (pair) => (pair.a === hovered && pair.b === key) || (pair.b === hovered && pair.a === key),
      )
    );
  }

  protected dimmed(pair: Correlation): boolean {
    const hovered = this.hovered();
    return !!hovered && pair.a !== hovered && pair.b !== hovered;
  }

  protected short(text: string): string {
    return text.length > 20 ? `${text.slice(0, 19)}…` : text;
  }
}

function toward(
  point: { x: number; y: number },
  from: { x: number; y: number },
  by: number,
): { x: number; y: number } {
  const [dx, dy] = [from.x - point.x, from.y - point.y];
  const length = Math.hypot(dx, dy) || 1;
  return { x: point.x + (dx / length) * by, y: point.y + (dy / length) * by };
}
