import {toSignal} from '@angular/core/rxjs-interop';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatButtonToggleModule} from '@angular/material/button-toggle';
import {MatCheckboxModule} from '@angular/material/checkbox';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {TranslocoPipe, TranslocoService} from '@jsverse/transloco';
import {EXPERIMENT_DAYS, ExperimentInput, QuestionNumber} from '@pd/contracts';
import {LifeApi} from '../life.api';

/** Tomorrow by the device's clock: an experiment starts on a day not begun yet. */
function tomorrow(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * A new experiment: the question, the change of a changed day, the main number (a daily number
 * of Links or a rating 1–5 the bot asks), how long, when it starts and when the morning message
 * comes — and the promise that it is an everyday change, not medications, food or less sleep.
 */
@Component({
  selector: 'pd-experiment-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    TranslocoPipe,
  ],
  template: `
    <div class="fields">
      <mat-form-field class="wide" subscriptSizing="dynamic">
        <mat-label>{{ 'life.lab.form.hypothesis' | transloco }}</mat-label>
        <input matInput maxlength="300" [(ngModel)]="hypothesis" />
      </mat-form-field>
      <mat-form-field class="wide" subscriptSizing="dynamic">
        <mat-label>{{ 'life.lab.form.change' | transloco }}</mat-label>
        <input matInput maxlength="200" [(ngModel)]="change" />
      </mat-form-field>
      <mat-button-toggle-group
        class="wide"
        hideSingleSelectionIndicator
        [value]="kind()"
        (change)="kind.set($event.value)"
        [attr.aria-label]="'life.lab.form.metric' | transloco"
      >
        <mat-button-toggle value="number">{{
          'life.lab.form.number' | transloco
        }}</mat-button-toggle>
        <mat-button-toggle value="rating">{{
          'life.lab.form.rating' | transloco
        }}</mat-button-toggle>
      </mat-button-toggle-group>
      @if (kind() === 'number') {
        <mat-form-field class="wide" subscriptSizing="dynamic">
          <mat-label>{{ 'life.lab.form.metric' | transloco }}</mat-label>
          <mat-select [(ngModel)]="metricKey">
            @for (option of options(); track option.key) {
              <mat-option [value]="option.key">{{ option.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      } @else {
        <mat-form-field class="wide" subscriptSizing="dynamic">
          <mat-label>{{ 'life.lab.form.question' | transloco }}</mat-label>
          <input matInput maxlength="200" [(ngModel)]="question" />
        </mat-form-field>
        <mat-form-field subscriptSizing="dynamic">
          <mat-label>{{ 'life.lab.form.askAt' | transloco }}</mat-label>
          <input matInput type="time" [(ngModel)]="askAt" />
        </mat-form-field>
      }
      <mat-form-field subscriptSizing="dynamic">
        <mat-label>{{ 'life.lab.form.days' | transloco }}</mat-label>
        <input
          matInput
          type="number"
          [min]="limits.min"
          [max]="limits.max"
          [(ngModel)]="days"
        />
      </mat-form-field>
      <mat-form-field subscriptSizing="dynamic">
        <mat-label>{{ 'life.lab.form.startOn' | transloco }}</mat-label>
        <input matInput type="date" [(ngModel)]="startOn" />
      </mat-form-field>
      <mat-form-field subscriptSizing="dynamic">
        <mat-label>{{ 'life.lab.form.morningAt' | transloco }}</mat-label>
        <input matInput type="time" [(ngModel)]="morningAt" />
      </mat-form-field>
    </div>
    <mat-checkbox [(ngModel)]="safe">{{
      'life.lab.form.safe' | transloco
    }}</mat-checkbox>
    <p class="muted">{{ 'life.lab.form.how' | transloco }}</p>
    <div class="actions">
      <button
        matButton="filled"
        type="button"
        [disabled]="busy() || !ready()"
        (click)="start()"
      >
        {{ 'life.lab.form.start' | transloco }}
      </button>
      <button matButton type="button" (click)="cancelled.emit()">
        {{ 'core.actions.cancel' | transloco }}
      </button>
    </div>
    @if (failed()) {
      <p class="error" role="alert">{{ 'life.lab.form.failed' | transloco }}</p>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .fields {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr));
      gap: 8px 12px;
    }
    .wide {
      grid-column: 1 / -1;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .muted {
      margin: 0;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .error {
      margin: 0;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-error);
    }
  `,
})
export class ExperimentFormComponent implements OnInit {
  private readonly api = inject(LifeApi);
  private readonly transloco = inject(TranslocoService);
  private readonly language = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  /** The daily numbers to choose from. */
  readonly numbers = input<QuestionNumber[]>([]);
  /** What a "check it" of a finding brings: the question and the number. */
  readonly preset = input<{hypothesis?: string; metric?: string}>({});
  readonly started = output<void>();
  readonly cancelled = output<void>();

  protected readonly limits = EXPERIMENT_DAYS;
  protected readonly hypothesis = signal('');
  protected readonly change = signal('');
  protected readonly kind = signal<'number' | 'rating'>('number');
  protected readonly metricKey = signal('');
  protected readonly question = signal('');
  protected readonly askAt = signal('18:00');
  protected readonly days = signal<number>(EXPERIMENT_DAYS.usual);
  protected readonly startOn = signal(tomorrow());
  protected readonly morningAt = signal('08:00');
  protected readonly safe = signal(false);
  protected readonly busy = signal(false);
  protected readonly failed = signal(false);

  ngOnInit(): void {
    // Read once: what is typed afterwards is the user's own.
    const preset = this.preset();
    if (preset.hypothesis) {
      this.hypothesis.set(preset.hypothesis);
    }
    if (preset.metric) {
      this.metricKey.set(preset.metric);
    }
  }

  protected readonly options = computed(() => {
    const language = this.language();
    return this.numbers()
      .map(one => ({
        key: one.key,
        name: one.label ?? this.transloco.translate<string>(one.labelKey),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, language));
  });

  protected readonly ready = computed(
    () =>
      this.safe() &&
      this.hypothesis().trim().length >= 3 &&
      this.change().trim().length >= 3 &&
      Number(this.days()) >= EXPERIMENT_DAYS.min &&
      Number(this.days()) <= EXPERIMENT_DAYS.max &&
      Boolean(this.startOn()) &&
      (this.kind() === 'number'
        ? this.options().some(one => one.key === this.metricKey())
        : this.question().trim().length >= 3),
  );

  protected start(): void {
    const input: ExperimentInput = {
      hypothesis: this.hypothesis().trim(),
      change: this.change().trim(),
      metric:
        this.kind() === 'number'
          ? {kind: 'number', key: this.metricKey()}
          : {
              kind: 'rating',
              question: this.question().trim(),
              askAt: this.askAt(),
            },
      days: Number(this.days()),
      startOn: this.startOn(),
      morningAt: this.morningAt(),
      safe: true,
    };
    this.busy.set(true);
    this.failed.set(false);
    this.api.startExperiment(input).subscribe({
      next: () => {
        this.busy.set(false);
        this.started.emit();
      },
      error: () => {
        this.busy.set(false);
        this.failed.set(true);
      },
    });
  }
}
