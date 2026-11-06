import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import {MatCardModule} from '@angular/material/card';
import {MatIconModule} from '@angular/material/icon';
import {TranslocoPipe, TranslocoService} from '@jsverse/transloco';
import {CorrelationCurve, CorrelationMetric} from '@pd/contracts';
import {moduleColor, SelectedPair} from './links-format';

/** The curves listed. */
const LISTED = 10;

/**
 * "Not straight lines": pairs where more is not simply more — the most (or the least) of one is
 * at a middle amount of the other. Choosing one opens its pair, with the dose chart.
 */
@Component({
  selector: 'pd-curves-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatCardModule, MatIconModule, TranslocoPipe],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-icon mat-card-avatar>show_chart</mat-icon>
        <mat-card-title>{{
          'life.links.curves.title' | transloco
        }}</mat-card-title>
        <mat-card-subtitle>{{
          'life.links.curves.hint' | transloco
        }}</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        <ul class="curves">
          @for (curve of listed(); track curve.a + curve.b + curve.lag) {
            <li>
              <button
                type="button"
                (click)="pick.emit({a: curve.a, b: curve.b, lag: curve.lag})"
              >
                <span class="dots" aria-hidden="true">
                  <span class="dot" [style.background]="color(curve.a)"></span>
                  <span class="dot" [style.background]="color(curve.b)"></span>
                </span>
                <span class="text">
                  <span>{{ sentence(curve) }}</span>
                  <span class="meta">
                    {{ 'life.links.days' | transloco: {days: curve.n} }}
                    @if (curve.lag) {
                      ·
                      {{
                        'life.links.daysLater' | transloco: {days: curve.lag}
                      }}
                    }
                  </span>
                </span>
              </button>
            </li>
          }
        </ul>
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    :host {
      display: block;
    }
    .curves {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    button {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: 12px;
      align-items: center;
      width: 100%;
      padding: 8px;
      border: 0;
      border-radius: 8px;
      background: none;
      color: inherit;
      font: inherit;
      text-align: start;
      cursor: pointer;
    }
    button:hover {
      background: var(--mat-sys-surface-container);
    }
    .dots {
      display: flex;
      gap: 3px;
    }
    .dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
    }
    .text {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .meta {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class CurvesCardComponent {
  readonly curves = input.required<CorrelationCurve[]>();
  readonly metrics = input.required<Map<string, CorrelationMetric>>();
  readonly pick = output<SelectedPair>();

  private readonly transloco = inject(TranslocoService);

  protected readonly listed = computed(() => this.curves().slice(0, LISTED));

  protected color(key: string): string {
    return moduleColor(this.metrics().get(key)?.module ?? '');
  }

  /** A curve in words: a hill ("most in the middle") or a valley. */
  protected sentence(curve: CorrelationCurve): string {
    return curveSentence(
      curve,
      key => {
        const metric = this.metrics().get(key);
        return metric
          ? (metric.label ?? this.transloco.translate(metric.labelKey))
          : key;
      },
      this.transloco,
    );
  }
}

/** A curve in words, for the card and for the pair it opens. */
export function curveSentence(
  curve: CorrelationCurve,
  name: (key: string) => string,
  transloco: TranslocoService,
): string {
  return transloco.translate(
    curve.bend < 0 ? 'life.links.curves.hill' : 'life.links.curves.valley',
    {a: name(curve.a), b: name(curve.b)},
  );
}
