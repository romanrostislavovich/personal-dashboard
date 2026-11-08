import {toSignal} from '@angular/core/rxjs-interop';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatButtonToggleModule} from '@angular/material/button-toggle';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatSelectModule} from '@angular/material/select';
import {TranslocoPipe, TranslocoService} from '@jsverse/transloco';
import {Experiment, ExperimentDayInput} from '@pd/contracts';
import {LifeApi} from '../life.api';
import {dayOf} from '../links/question-wording';

type Day = Experiment['days'][number];

/**
 * A day of an experiment marked by hand: the rating the bot would have asked (a rating metric
 * only), and whether the day went as planned — a day not kept is left out of the result.
 */
@Component({
  selector: 'pd-experiment-day',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatSelectModule,
    TranslocoPipe,
  ],
  template: `
    <fieldset>
      <legend>{{ 'life.lab.mark.title' | transloco }}</legend>
      <mat-form-field class="day" subscriptSizing="dynamic">
        <mat-label>{{ 'life.lab.mark.day' | transloco }}</mat-label>
        <mat-select [ngModel]="chosen()" (ngModelChange)="choose($event)">
          @for (option of options(); track option.day) {
            <mat-option [value]="option.day">{{ option.name }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      @if (experiment().metric.kind === 'rating') {
        <mat-button-toggle-group
          hideSingleSelectionIndicator
          [value]="rating()"
          (change)="rating.set($event.value)"
          [attr.aria-label]="'life.lab.mark.rating' | transloco"
        >
          @for (value of ratings; track value) {
            <mat-button-toggle [value]="value">{{ value }}</mat-button-toggle>
          }
        </mat-button-toggle-group>
      }
      <mat-button-toggle-group
        hideSingleSelectionIndicator
        [value]="kept()"
        (change)="kept.set($event.value)"
        [attr.aria-label]="'life.lab.mark.kept' | transloco"
      >
        <mat-button-toggle [value]="true">{{
          'life.lab.mark.asPlanned' | transloco
        }}</mat-button-toggle>
        <mat-button-toggle [value]="false">{{
          'life.lab.mark.notPlanned' | transloco
        }}</mat-button-toggle>
      </mat-button-toggle-group>
      <button
        matButton="tonal"
        type="button"
        [disabled]="busy() || !chosen()"
        (click)="save()"
      >
        {{ 'core.actions.save' | transloco }}
      </button>
      @if (failed()) {
        <p class="error" role="alert">
          {{ 'life.lab.mark.failed' | transloco }}
        </p>
      }
    </fieldset>
  `,
  styles: `
    fieldset {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 12px;
      align-items: center;
      margin: 12px 0 0;
      padding: 8px 12px 12px;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 12px;
    }
    .day {
      flex: 1 1 260px;
      min-width: 0;
    }
    legend {
      padding: 0 4px;
      font: var(--mat-sys-label-large);
    }
    .error {
      flex-basis: 100%;
      margin: 0;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-error);
    }
  `,
})
export class ExperimentDayComponent {
  private readonly api = inject(LifeApi);
  private readonly transloco = inject(TranslocoService);
  private readonly language = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  readonly experiment = input.required<Experiment>();
  /** The begun days, the newest first. */
  readonly days = input.required<Day[]>();
  readonly marked = output<void>();

  protected readonly ratings = [1, 2, 3, 4, 5];
  private readonly picked = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly failed = signal(false);

  /** The day picked, else the newest one. */
  protected readonly chosen = computed(
    () => this.picked() ?? this.days()[0]?.day ?? null,
  );

  private readonly found = computed(() =>
    this.days().find(one => one.day === this.chosen()),
  );
  /** What the chosen day already has, until it is changed here. */
  protected readonly rating = linkedSignal(() =>
    this.experiment().metric.kind === 'rating'
      ? (this.found()?.value ?? null)
      : null,
  );
  protected readonly kept = linkedSignal(() => this.found()?.kept ?? null);

  protected readonly options = computed(() => {
    const wording = {
      locale: this.language(),
      translate: (key: string) => this.transloco.translate(key),
    };
    return this.days().map(day => ({
      day: day.day,
      name: `${dayOf(day.day, wording)} · ${this.transloco.translate(`life.lab.condition.${day.condition}`)}`,
    }));
  });

  protected choose(day: string): void {
    this.picked.set(day);
  }

  protected save(): void {
    const day = this.chosen();
    if (!day) {
      return;
    }
    const input: ExperimentDayInput = {day, kept: this.kept()};
    if (this.experiment().metric.kind === 'rating') {
      input.rating = this.rating();
    }
    this.busy.set(true);
    this.failed.set(false);
    this.api.markExperimentDay(this.experiment().id, input).subscribe({
      next: () => {
        this.busy.set(false);
        this.marked.emit();
      },
      error: () => {
        this.busy.set(false);
        this.failed.set(true);
      },
    });
  }
}
