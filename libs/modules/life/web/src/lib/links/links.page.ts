import {DecimalPipe, PercentPipe} from '@angular/common';
import {httpResource} from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  linkedSignal,
  inject,
  signal,
} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatButtonToggleModule} from '@angular/material/button-toggle';
import {MatCardModule} from '@angular/material/card';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {MatSelectModule} from '@angular/material/select';
import {MatTooltipModule} from '@angular/material/tooltip';
import {TranslocoPipe, TranslocoService} from '@jsverse/transloco';
import {CORE_READS} from '@pd/client-core';
import {
  Correlation,
  CorrelationCurve,
  CorrelationMetric,
  CorrelationPairs,
  Correlations,
} from '@pd/contracts';
import {LifeApi} from '../life.api';
import {BeforeAfterComponent} from './before-after.component';
import {ChangesCardComponent} from './changes-card.component';
import {CurvesCardComponent, curveSentence} from './curves-card.component';
import {DoseChartComponent, dosePoints} from './dose-chart.component';
import {ForecastsCardComponent} from './forecasts-card.component';
import {HourAfterCardComponent} from './hour-after-card.component';
import {RhythmCardComponent} from './rhythm-card.component';
import {WindowCardComponent} from './window-card.component';
import {UnusualCardComponent} from './unusual-card.component';
import {CorrelationGraphComponent} from './correlation-graph.component';
import {CorrelationMatrixComponent} from './correlation-matrix.component';
import {CorrelationScatterComponent} from './correlation-scatter.component';
import {LinksControlsComponent} from './links-controls.component';
import {DIGITAL_METRIC_KEYS, isDigitalMetric} from './digital-metrics';
import {
  EXTRA_KEY,
  localDate,
  PAIRS_KEY,
  remember,
  remembered,
} from './links-memory';
import {moduleColor, SelectedPair} from './links-format';

const PERIODS = [90, 180, 365, 730] as const;
/** The strong links listed before "show all". */
const LISTED = 10;
/** A link of a day to the next one that stays this strong with yesterday held fixed comes first. */
const LEADS_FROM = 0.2;

/**
 * Life → Links: how the daily numbers of every section go together — the strongest links in
 * words, as a graph and as a matrix, one pair day by day, and what predicts a chosen number
 * with the others held fixed. Counted on the server (the core's links engine).
 */
@Component({
  selector: 'pd-links-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BeforeAfterComponent,
    ChangesCardComponent,
    CorrelationGraphComponent,
    CurvesCardComponent,
    CorrelationMatrixComponent,
    CorrelationScatterComponent,
    DecimalPipe,
    DoseChartComponent,
    LinksControlsComponent,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatProgressBarModule,
    MatSelectModule,
    MatTooltipModule,
    PercentPipe,
    TranslocoPipe,
    ForecastsCardComponent,
    HourAfterCardComponent,
    RhythmCardComponent,
    WindowCardComponent,
    UnusualCardComponent,
  ],
  templateUrl: './links.page.html',
  styleUrl: './links.page.scss',
})
export class LinksPage {
  private readonly transloco = inject(TranslocoService);
  private readonly api = inject(LifeApi);

  protected readonly periods = PERIODS;
  protected readonly days = signal<number>(PERIODS[2]);
  protected readonly target = signal<string | null>(null);
  protected readonly chosen = signal<SelectedPair | null>(null);
  protected readonly showAll = signal(false);
  protected readonly digitalFilter = signal('');
  protected readonly digitalMetrics = DIGITAL_METRIC_KEYS;
  /** With the outcomes only (mood, tasks done, sleep, coding…), or everything with everything. */
  protected readonly pairs = signal<CorrelationPairs>(
    remembered(PAIRS_KEY) === 'all' ? 'all' : 'outcomes',
  );
  /** The extra numbers switched on (see DailyMetric.extra). */
  protected readonly extra = signal<string[]>(
    (remembered(EXTRA_KEY) ?? '').split(',').filter(Boolean),
  );

  protected readonly data = httpResource<Correlations>(() => {
    const to = new Date();
    const from = new Date(to);
    from.setDate(from.getDate() - this.days() + 1);
    return CORE_READS.correlations(
      localDate(from),
      localDate(to),
      this.target() ?? undefined,
      {pairs: this.pairs(), extra: this.extra()},
    );
  });
  /**
   * The last links counted: kept while a new choice is being counted (and after a failed one),
   * so the page and its controls do not vanish on every change.
   */
  protected readonly result = linkedSignal<
    Correlations | undefined,
    Correlations | undefined
  >({
    source: () => (this.data.hasValue() ? this.data.value() : undefined),
    computation: (value, previous) => value ?? previous?.value,
  });
  protected readonly known = computed(
    () => new Set((this.result()?.metrics ?? []).map(metric => metric.key)),
  );

  protected readonly byKey = computed(
    () =>
      new Map(
        (this.result()?.metrics ?? []).map(metric => [metric.key, metric]),
      ),
  );

  protected readonly correlations = computed(() => {
    const filter = this.digitalFilter();
    return (this.result()?.correlations ?? []).filter(
      pair =>
        !filter ||
        (filter === 'digital'
          ? isDigitalMetric(pair.a) || isDigitalMetric(pair.b)
          : pair.a === filter || pair.b === filter),
    );
  });
  protected readonly visibleMetrics = computed(() => {
    const keys = new Set(this.correlations().flatMap(pair => [pair.a, pair.b]));
    return (this.result()?.metrics ?? []).filter(
      metric => !this.digitalFilter() || keys.has(metric.key),
    );
  });

  protected readonly strong = computed(() =>
    this.correlations().filter(pair => pair.strong),
  );
  protected readonly listed = computed(() =>
    this.showAll() ? this.strong() : this.strong().slice(0, LISTED),
  );

  /** The pairs that bend (not a straight line), within the section filter like the links. */
  protected readonly curves = computed(() => {
    const filter = this.digitalFilter();
    return (this.result()?.curves ?? []).filter(
      curve =>
        !filter ||
        (filter === 'digital'
          ? isDigitalMetric(curve.a) || isDigitalMetric(curve.b)
          : curve.a === filter || curve.b === filter),
    );
  });

  /** Every extra number the filter can switch, on or off. */
  protected readonly extras = computed(() => this.result()?.extras ?? []);

  /** The metrics a regression can explain: of enough days, by name. */
  protected readonly targets = computed(() =>
    [...(this.result()?.metrics ?? [])].sort((a, b) =>
      this.name(a).localeCompare(this.name(b)),
    ),
  );

  /** The pair shown day by day: the chosen one, or the strongest. */
  protected readonly pair = computed(() => {
    const chosen = this.chosen();
    const all = this.correlations();
    const found = chosen
      ? all.find(
          pair =>
            pair.lag === chosen.lag &&
            ((pair.a === chosen.a && pair.b === chosen.b) ||
              (!pair.lag && pair.a === chosen.b && pair.b === chosen.a)),
        )
      : (this.strong()[0] ?? all[0]);
    const [a, b] = found ? [this.metric(found.a), this.metric(found.b)] : [];
    if (!found || !a || !b) {
      return null;
    }
    // A pair of the same day chosen the other way round (a curve of b along a): its chart too.
    const turned = chosen && !found.lag && found.a === chosen.b;
    // Opened from the curves: said as the curve, not as the weak straight link it also is.
    const curve = chosen
      ? this.curves().find(
          item =>
            item.a === chosen.a &&
            item.b === chosen.b &&
            item.lag === chosen.lag,
        )
      : undefined;
    return {
      pair: found,
      a,
      b,
      doseA: turned ? b : a,
      doseB: turned ? a : b,
      curve,
    };
  });

  protected metric(key: string): CorrelationMetric | undefined {
    return this.byKey().get(key);
  }

  protected setPairs(pairs: CorrelationPairs): void {
    this.pairs.set(pairs);
    remember(PAIRS_KEY, pairs);
  }

  protected setExtra(keys: string[]): void {
    this.extra.set(keys);
    remember(EXTRA_KEY, keys.join(','));
  }

  protected filterDigital(key: string): void {
    this.digitalFilter.set(key);
    this.chosen.set(null);
    this.showAll.set(false);
  }

  protected name(metric: CorrelationMetric | undefined): string {
    return metric
      ? (metric.label ?? this.transloco.translate(metric.labelKey))
      : '';
  }

  protected nameOf(key: string): string {
    return this.name(this.metric(key));
  }

  protected color(key: string): string {
    return moduleColor(this.metric(key)?.module ?? '');
  }

  protected curveText(curve: CorrelationCurve): string {
    return curveSentence(curve, key => this.nameOf(key), this.transloco);
  }

  /** The link in words: of the same day or the next, together or against. */
  protected sentence(pair: Correlation): string {
    const key =
      pair.lag > 1
        ? pair.rho > 0
          ? 'life.links.laterMore'
          : 'life.links.laterLess'
        : pair.lag
          ? pair.rho > 0
            ? 'life.links.thenMore'
            : 'life.links.thenLess'
          : pair.rho > 0
            ? 'life.links.together'
            : 'life.links.against';
    return this.transloco.translate(key, {
      a: this.nameOf(pair.a),
      b: this.nameOf(pair.b),
      days: pair.lag,
    });
  }

  protected strength(rho: number): string {
    const value = Math.abs(rho);
    return value >= 0.6 ? 'strong' : value >= 0.4 ? 'medium' : 'weak';
  }

  protected leads(pair: Correlation): boolean {
    return pair.lag === 1 && Math.abs(pair.beyondItself ?? 0) >= LEADS_FROM;
  }

  protected choose(pair: SelectedPair): void {
    this.chosen.set(pair);
    // For the achievements only, and only when the pair has a chart to look at; a lost mark is
    // not worth a message.
    const [a, b] = [this.metric(pair.a), this.metric(pair.b)];
    if (a && b && dosePoints(a, b, pair.lag).groups.length >= 2) {
      this.api
        .seen({kind: 'dose', key: `${pair.a}|${pair.b}|${pair.lag}`})
        .subscribe({error: () => undefined});
    }
    document
      .getElementById('pd-links-pair')
      ?.scrollIntoView({behavior: 'smooth', block: 'start'});
  }

  protected explain(key: string): void {
    this.target.set(key);
    document
      .getElementById('pd-links-regression')
      ?.scrollIntoView({behavior: 'smooth', block: 'start'});
  }

  /** A bar of a regression term: its share of the largest coefficient. */
  protected barWidth(beta: number, terms: {beta: number}[]): number {
    const largest = Math.max(...terms.map(term => Math.abs(term.beta)), 0.01);
    return (Math.abs(beta) / largest) * 100;
  }
}
