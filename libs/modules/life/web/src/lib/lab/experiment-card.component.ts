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
import {ExperimentResultComponent} from './experiment-result.component';
import {ExperimentStripComponent} from './experiment-strip.component';

/**
 * One experiment: its question and change, today's kind, the strip of its days, what came of
 * it, and its controls — pause, go on, stop, delete (the last two asked first: they cannot be
 * taken back here), new words or hours (a new version, the old ones listed), a day marked.
 */
@Component({
  selector: 'pd-experiment-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ExperimentDayComponent,
    ExperimentEditComponent,
    ExperimentResultComponent,
    ExperimentStripComponent,
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
            <button mat-menu-item type="button" (click)="stop()">
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

        <pd-experiment-strip
          [experiment]="item"
          [today]="today()"
          [format]="format"
        />
        <pd-experiment-result [result]="item.result" [format]="format" />

        @if (editing()) {
          <pd-experiment-edit
            [experiment]="item"
            (saved)="edited()"
            (cancelled)="editing.set(false)"
          />
        }
        @if (item.status !== 'stopped' && begunDays().length) {
          <pd-experiment-day
            [experiment]="item"
            [days]="begunDays()"
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
              @for (version of versions(); track version.version) {
                <li>
                  <span class="muted">{{ version.on }}:</span>
                  {{ version.text }}
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
    .versions {
      margin-top: 12px;
      font: var(--mat-sys-body-small);
    }
    .versions ol {
      margin: 4px 0 0;
      padding-inline-start: 20px;
      overflow-wrap: anywhere;
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

  /** The days that may be marked by hand: begun ones (today too), the newest first. */
  protected readonly begunDays = computed(() =>
    this.experiment()
      .days.filter(day => day.day <= this.today())
      .reverse(),
  );

  /** Each version's rules in words, its hours too (a change of them alone is a version). */
  protected readonly versions = computed(() => {
    const {metric, versions} = this.experiment();
    return versions.map(version => ({
      version: version.version,
      on: dayOf(version.at.slice(0, 10), this.wording()),
      text: this.transloco.translate(
        metric.kind === 'rating' && version.askAt
          ? 'life.lab.versionRating'
          : 'life.lab.version',
        version,
      ),
    }));
  });

  /** A value in the experiment's unit: a rating with a decimal, a number as Links shows it. */
  protected readonly format = (value: number): string => {
    const {metric} = this.experiment();
    if (metric.kind === 'rating') {
      return new Intl.NumberFormat(this.language(), {
        maximumFractionDigits: 1,
      }).format(value);
    }
    return valueOf(metric, value, this.wording());
  };

  protected setStatus(status: NonNullable<ExperimentUpdate['status']>): void {
    this.run(this.api.updateExperiment(this.experiment().id, {status}));
  }

  protected stop(): void {
    if (this.asked('life.lab.confirmStop')) {
      this.setStatus('stopped');
    }
  }

  protected remove(): void {
    if (this.asked('life.lab.confirmRemove')) {
      this.run(this.api.removeExperiment(this.experiment().id));
    }
  }

  protected edited(): void {
    this.editing.set(false);
    this.changed.emit();
  }

  private asked(key: string): boolean {
    return confirm(
      this.transloco.translate(key, {
        hypothesis: this.experiment().hypothesis,
      }),
    );
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
