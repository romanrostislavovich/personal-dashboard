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
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {TranslocoPipe} from '@jsverse/transloco';
import {Experiment, ExperimentUpdate} from '@pd/contracts';
import {LifeApi} from '../life.api';

/**
 * New words or hours of a running experiment. The schedule and the main number stay: a change
 * of them would be another experiment. The server keeps the old rules as an earlier version.
 */
@Component({
  selector: 'pd-experiment-edit',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
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
      <mat-form-field subscriptSizing="dynamic">
        <mat-label>{{ 'life.lab.form.morningAt' | transloco }}</mat-label>
        <input matInput type="time" [(ngModel)]="morningAt" />
      </mat-form-field>
      @if (experiment().metric.kind === 'rating') {
        <mat-form-field subscriptSizing="dynamic">
          <mat-label>{{ 'life.lab.form.askAt' | transloco }}</mat-label>
          <input matInput type="time" [(ngModel)]="askAt" />
        </mat-form-field>
      }
    </div>
    <p class="muted">{{ 'life.lab.editHint' | transloco }}</p>
    <div class="actions">
      <button
        matButton="filled"
        type="button"
        [disabled]="busy() || !ready()"
        (click)="save()"
      >
        {{ 'core.actions.save' | transloco }}
      </button>
      <button matButton type="button" (click)="cancelled.emit()">
        {{ 'core.actions.cancel' | transloco }}
      </button>
    </div>
    @if (failed()) {
      <p class="error" role="alert">{{ 'life.lab.failed' | transloco }}</p>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 12px;
    }
    .fields {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 160px), 1fr));
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
export class ExperimentEditComponent implements OnInit {
  private readonly api = inject(LifeApi);

  readonly experiment = input.required<Experiment>();
  readonly saved = output<void>();
  readonly cancelled = output<void>();

  protected readonly hypothesis = signal('');
  protected readonly change = signal('');
  protected readonly morningAt = signal('');
  protected readonly askAt = signal('');
  protected readonly busy = signal(false);
  protected readonly failed = signal(false);

  ngOnInit(): void {
    const item = this.experiment();
    this.hypothesis.set(item.hypothesis);
    this.change.set(item.change);
    this.morningAt.set(item.morningAt);
    this.askAt.set(item.metric.kind === 'rating' ? item.metric.askAt : '');
  }

  protected readonly ready = computed(
    () =>
      this.hypothesis().trim().length >= 3 &&
      this.change().trim().length >= 3 &&
      Boolean(this.morningAt()),
  );

  /** Only what changed is sent, so an unchanged form makes no new version. */
  protected save(): void {
    const item = this.experiment();
    const update: ExperimentUpdate = {};
    if (this.hypothesis().trim() !== item.hypothesis) {
      update.hypothesis = this.hypothesis().trim();
    }
    if (this.change().trim() !== item.change) {
      update.change = this.change().trim();
    }
    if (this.morningAt() !== item.morningAt) {
      update.morningAt = this.morningAt();
    }
    if (
      item.metric.kind === 'rating' &&
      this.askAt() &&
      this.askAt() !== item.metric.askAt
    ) {
      update.askAt = this.askAt();
    }
    if (!Object.keys(update).length) {
      this.cancelled.emit();
      return;
    }
    this.busy.set(true);
    this.failed.set(false);
    this.api.updateExperiment(item.id, update).subscribe({
      next: () => {
        this.busy.set(false);
        this.saved.emit();
      },
      error: () => {
        this.busy.set(false);
        this.failed.set(true);
      },
    });
  }
}
