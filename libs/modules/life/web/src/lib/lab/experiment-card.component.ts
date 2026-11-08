import {toSignal} from '@angular/core/rxjs-interop';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatCardModule} from '@angular/material/card';
import {MatIconModule} from '@angular/material/icon';
import {MatMenuModule} from '@angular/material/menu';
import {TranslocoPipe, TranslocoService} from '@jsverse/transloco';
import {Experiment, ExperimentUpdate} from '@pd/contracts';
import {LifeApi} from '../life.api';
import {dayOf, valueOf, Wording} from '../links/question-wording';
import {ExperimentDayComponent} from './experiment-day.component';
import {ExperimentEditComponent} from './experiment-edit.component';

/** Fewer days of a kind than this and the lab says nothing yet (the server's `MIN_EACH`). */
const MIN_EACH = 6;

/**
 * One experiment: its question and change, today's kind, the strip of its days (ordinary or
 * changed, with a value or missing), what came of it — each kind's mean, the difference and its
 * 95 % interval, told as a description — and its controls: pause, go on, stop, delete, new
 * words or hours (a new version, the old ones listed), and a day marked by hand.
 */
@Component({
  selector: 'pd-experiment-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ExperimentDayComponent,
    ExperimentEditComponent,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatMenuModule,
    TranslocoPipe,
  ],
  template: `
    @let item = experiment();
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-icon mat-card-avatar>science</mat-icon>
        <mat-card-title>{{ item.hypothesis }}</mat-card-title>
        <mat-card-subtitle>
          {{ 'life.lab.status.' + item.status | transloco }} ·
          {{ period() }}
        </mat-card-subtitle>
        <button
          matIconButton
          type="button"
          class="menu"
          [matMenuTriggerFor]="menu"
          [attr.aria-label]="'life.lab.actions' | transloco"
          [disabled]="busy()"
        >
          <mat-icon>more_vert</mat-icon>
        </button>
        <mat-menu #menu="matMenu">
          @if (item.status === 'running') {
            <button mat-menu-item type="button" (click)="setStatus('paused')">
              <mat-icon>pause</mat-icon>
              {{ 'life.lab.pause' | transloco }}
            </button>
          }
          @if (item.status === 'paused') {
            <button mat-menu-item type="button" (click)="setStatus('running')">
              <mat-icon>play_arrow</mat-icon>
              {{ 'life.lab.resume' | transloco }}
            </button>
          }
          @if (active()) {
            <button mat-menu-item type="button" (click)="editing.set(true)">
              <mat-icon>edit</mat-icon>
              {{ 'life.lab.edit' | transloco }}
            </button>
            <button mat-menu-item type="button" (click)="setStatus('stopped')">
              <mat-icon>stop</mat-icon>
              {{ 'life.lab.stop' | transloco }}
            </button>
          }
          <button mat-menu-item type="button" (click)="remove()">
            <mat-icon>delete</mat-icon>
            {{ 'core.actions.delete' | transloco }}
          </button>
        </mat-menu>
      </mat-card-header>
      <mat-card-content>
        <p class="line">
          <span class="muted">{{ 'life.lab.change' | transloco }}:</span>
          {{ item.change }}
        </p>
        <p class="line">
          <span class="muted">{{ 'life.lab.metric' | transloco }}:</span>
          {{ metricName() }}
        </p>
        @if (item.today && item.status === 'running') {
          <p class="today" [class.changed]="item.today === 'changed'">
            {{ 'life.lab.today.' + item.today | transloco }}
          </p>
        }

        <ul class="strip" [attr.aria-label]="'life.lab.days' | transloco">
          @for (day of strip(); track day.day) {
            <li
              [class]="day.condition"
              [class.filled]="day.filled"
              [class.skipped]="day.kept === false"
              [class.future]="day.future"
              [attr.title]="day.title"
            ></li>
          }
        </ul>
        <p class="legend muted">
          <span class="swatch ordinary filled"></span>
          {{ 'life.lab.condition.ordinary' | transloco }}
          <span class="swatch changed filled"></span>
          {{ 'life.lab.condition.changed' | transloco }}
          <span class="swatch ordinary"></span>
          {{ 'life.lab.missing' | transloco }}
        </p>

        <div class="result">
          @if (result(); as told) {
            <p>{{ told.groups }}</p>
            <p class="difference">{{ told.difference }}</p>
            <p class="muted">{{ 'life.lab.caution' | transloco }}</p>
          } @else {
            <p class="muted">
              {{ 'life.lab.notEnough' | transloco: needed() }}
            </p>
          }
          @if (item.result.notKept || item.result.missing) {
            <p class="muted">
              {{
                'life.lab.leftOut'
                  | transloco
                    : {
                        notKept: item.result.notKept,
                        missing: item.result.missing,
                      }
              }}
            </p>
          }
        </div>

        @if (editing()) {
          <pd-experiment-edit
            [experiment]="item"
            (saved)="edited()"
            (cancelled)="editing.set(false)"
          />
        }
        @if (active() && pastDays().length) {
          <pd-experiment-day
            [experiment]="item"
            [days]="pastDays()"
            (marked)="changed.emit()"
          />
        }

        @if (item.versions.length > 1) {
          <details class="versions">
            <summary>
              {{
                'life.lab.versions' | transloco: {count: item.versions.length}
              }}
            </summary>
            <ol>
              @for (version of item.versions; track version.version) {
                <li>
                  <span class="muted">{{ dayOfIso(version.at) }}:</span>
                  {{ version.hypothesis }} — {{ version.change }}
                </li>
              }
            </ol>
          </details>
        }
        @if (failed()) {
          <p class="error" role="alert">
            {{ 'life.lab.failed' | transloco }}
          </p>
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    :host {
      display: block;
    }
    mat-card-header {
      position: relative;
      padding-inline-end: 48px;
    }
    mat-card-title {
      overflow-wrap: anywhere;
    }
    .menu {
      position: absolute;
      inset-inline-end: 4px;
      top: 8px;
    }
    .line {
      margin: 4px 0 0;
      overflow-wrap: anywhere;
    }
    .today {
      display: inline-block;
      margin: 8px 0 0;
      padding: 4px 12px;
      border-radius: 16px;
      font: var(--mat-sys-label-large);
      background: var(--mat-sys-surface-container-high);
    }
    .today.changed {
      background: var(--mat-sys-tertiary-container);
      color: var(--mat-sys-on-tertiary-container);
    }
    .strip {
      display: flex;
      flex-wrap: wrap;
      gap: 3px;
      margin: 12px 0 4px;
      padding: 0;
      list-style: none;
    }
    .strip li,
    .swatch {
      width: 14px;
      height: 14px;
      border-radius: 3px;
      box-sizing: border-box;
      border: 2px solid var(--mat-sys-outline);
    }
    .swatch {
      display: inline-block;
      vertical-align: middle;
      margin-inline: 8px 4px;
    }
    .swatch:first-child {
      margin-inline-start: 0;
    }
    .changed {
      border-color: var(--mat-sys-tertiary);
    }
    .ordinary.filled {
      background: var(--mat-sys-outline);
    }
    .changed.filled {
      background: var(--mat-sys-tertiary);
    }
    .strip .future {
      opacity: 0.35;
    }
    .strip .skipped {
      border-style: dashed;
      background: none;
    }
    .legend {
      margin: 0;
    }
    .result {
      margin-top: 12px;
    }
    .result p {
      margin: 4px 0 0;
      overflow-wrap: anywhere;
    }
    .difference {
      font: var(--mat-sys-title-medium);
    }
    .versions {
      margin-top: 12px;
      font: var(--mat-sys-body-small);
    }
    .versions ol {
      margin: 4px 0 0;
      padding-inline-start: 20px;
    }
    .muted {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .error {
      margin: 8px 0 0;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-error);
    }
  `,
})
export class ExperimentCardComponent {
  private readonly api = inject(LifeApi);
  private readonly transloco = inject(TranslocoService);
  private readonly language = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  readonly experiment = input.required<Experiment>();
  /** Today by the server, in the user's time zone. */
  readonly today = input.required<string>();
  /** Something of it changed: the page reads the lab again. */
  readonly changed = output<void>();

  protected readonly busy = signal(false);
  protected readonly failed = signal(false);
  protected readonly editing = signal(false);

  protected readonly active = computed(() =>
    ['running', 'paused'].includes(this.experiment().status),
  );

  private readonly wording = computed<Wording>(() => ({
    locale: this.language(),
    translate: (key, params) => this.transloco.translate(key, params),
  }));

  protected readonly period = computed(() => {
    const {startOn, endOn} = this.experiment();
    return `${dayOf(startOn, this.wording())} — ${dayOf(endOn, this.wording())}`;
  });

  protected readonly metricName = computed(() => {
    this.language();
    const {metric} = this.experiment();
    if (metric.kind === 'rating') {
      return this.transloco.translate('life.lab.ratingOf', {
        question: metric.question,
        time: metric.askAt,
      });
    }
    return metric.label ?? this.transloco.translate(metric.labelKey);
  });

  /** Each day of the plan: its kind, whether it has a value, and a title to hover. */
  protected readonly strip = computed(() => {
    this.language();
    const today = this.today();
    return this.experiment().days.map(day => {
      const future = day.day >= today;
      const condition = this.transloco.translate(
        `life.lab.condition.${day.condition}`,
      );
      const value =
        day.value === null
          ? this.transloco.translate('life.lab.missing')
          : this.format(day.value);
      return {
        ...day,
        future,
        filled: day.value !== null && day.kept !== false,
        title: `${dayOf(day.day, this.wording())} · ${condition}${future ? '' : ` · ${value}`}`,
      };
    });
  });

  /** The days that may be marked by hand: begun ones, the newest first. */
  protected readonly pastDays = computed(() =>
    this.experiment()
      .days.filter(day => day.day <= this.today())
      .reverse(),
  );

  /** "Ordinary days: 3.1 (8 days) · changed: 3.8 (7 days)" and the difference with its range. */
  protected readonly result = computed(() => {
    this.language();
    const {result} = this.experiment();
    const {ordinary, changed} = result;
    if (
      !result.enough ||
      ordinary.mean === null ||
      changed.mean === null ||
      result.difference === null
    ) {
      return null;
    }
    const signed = (value: number) =>
      `${value > 0 ? '+' : value < 0 ? '−' : ''}${this.format(Math.abs(value))}`;
    const groups = this.transloco.translate('life.lab.groups', {
      ordinary: this.format(ordinary.mean),
      ordinaryDays: ordinary.n,
      changed: this.format(changed.mean),
      changedDays: changed.n,
    });
    const interval = result.interval;
    const difference = interval
      ? this.transloco.translate('life.lab.difference', {
          value: signed(result.difference),
          from: signed(interval[0]),
          to: signed(interval[1]),
        })
      : this.transloco.translate('life.lab.differenceOnly', {
          value: signed(result.difference),
        });
    return {groups, difference};
  });

  /** How many more days of each kind are needed before anything is told. */
  protected readonly needed = computed(() => {
    const {ordinary, changed} = this.experiment().result;
    return {
      ordinary: Math.max(0, MIN_EACH - ordinary.n),
      changed: Math.max(0, MIN_EACH - changed.n),
    };
  });

  protected dayOfIso(at: string): string {
    return dayOf(at.slice(0, 10), this.wording());
  }

  protected setStatus(status: NonNullable<ExperimentUpdate['status']>): void {
    this.run(this.api.updateExperiment(this.experiment().id, {status}));
  }

  protected remove(): void {
    this.run(this.api.removeExperiment(this.experiment().id));
  }

  protected edited(): void {
    this.editing.set(false);
    this.changed.emit();
  }

  private format(value: number): string {
    const {metric} = this.experiment();
    if (metric.kind === 'rating') {
      return new Intl.NumberFormat(this.language(), {
        maximumFractionDigits: 1,
      }).format(value);
    }
    return valueOf(metric, value, this.wording());
  }

  private run(request: ReturnType<LifeApi['removeExperiment']>): void {
    this.busy.set(true);
    this.failed.set(false);
    request.subscribe({
      next: () => {
        this.busy.set(false);
        this.changed.emit();
      },
      error: () => {
        this.busy.set(false);
        this.failed.set(true);
      },
    });
  }
}
