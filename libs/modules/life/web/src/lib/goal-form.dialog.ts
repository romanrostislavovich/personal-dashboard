import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoPipe } from '@jsverse/transloco';
import { LifeGoal, LifeGoalDirection, LifeGoalInput, LifeMetric } from '@pd/contracts';

export interface GoalFormData {
  goal: LifeGoal | null;
  year: number;
  metrics: LifeMetric[];
}

/** "Counted by hand": mat-select treats null as no selection. */
const MANUAL = '';

/** A goal of a year: what it is counted from, which way and how much. */
@Component({
  selector: 'pd-life-goal-form-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    TranslocoPipe,
  ],
  template: `
    <h2 mat-dialog-title>
      {{ (data.goal ? 'life.goals.edit' : 'life.goals.add') | transloco }} · {{ data.year }}
    </h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content class="form">
        <mat-form-field>
          <mat-label>{{ 'life.goals.name' | transloco }}</mat-label>
          <input
            matInput
            formControlName="title"
            [placeholder]="'life.goals.namePlaceholder' | transloco"
            cdkFocusInitial
          />
        </mat-form-field>

        <mat-form-field>
          <mat-label>{{ 'life.goals.metric' | transloco }}</mat-label>
          <mat-select formControlName="metric">
            <mat-option [value]="manual">{{ 'life.goals.manual' | transloco }}</mat-option>
            @for (metric of metrics; track metric.key) {
              <mat-option [value]="metric.key">
                {{ metric.module + '.title' | transloco }} · {{ metric.key | transloco }}
              </mat-option>
            }
          </mat-select>
          <mat-hint>{{ 'life.goals.metricHint' | transloco }}</mat-hint>
        </mat-form-field>

        <div class="row">
          <mat-form-field>
            <mat-label>{{ 'life.goals.direction' | transloco }}</mat-label>
            <mat-select formControlName="direction">
              <mat-option value="atLeast">{{ 'life.goals.atLeast' | transloco }}</mat-option>
              <mat-option value="atMost">{{ 'life.goals.atMost' | transloco }}</mat-option>
            </mat-select>
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'life.goals.target' | transloco }}</mat-label>
            <input matInput type="number" min="0.1" step="any" formControlName="target" />
          </mat-form-field>
        </div>
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button matButton type="button" mat-dialog-close>
          {{ 'core.actions.cancel' | transloco }}
        </button>
        <button matButton="filled" type="submit" [disabled]="form.invalid">
          {{ 'core.actions.save' | transloco }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .form {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: min(460px, 80vw);
    }
    .row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
  `,
})
export class GoalFormDialog {
  protected readonly data = inject<GoalFormData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<GoalFormDialog, LifeGoalInput>);
  protected readonly manual = MANUAL;

  private readonly goal = this.data.goal;
  /** A goal on a card the modules no longer give still shows its own metric. */
  protected readonly metrics: LifeMetric[] =
    this.goal?.metric && !this.data.metrics.some((m) => m.key === this.goal?.metric)
      ? [
          ...this.data.metrics,
          {
            key: this.goal.metric,
            module: this.goal.metric.split('.')[0],
            icon: this.goal.icon,
            format: this.goal.format,
          },
        ]
      : this.data.metrics;

  protected readonly form = inject(NonNullableFormBuilder).group({
    title: [this.goal?.title ?? '', Validators.required],
    metric: [this.goal?.metric ?? MANUAL],
    direction: [(this.goal?.direction ?? 'atLeast') as LifeGoalDirection],
    target: [
      this.goal?.target ?? (null as number | null),
      [Validators.required, Validators.min(0.1)],
    ],
  });

  save(): void {
    const value = this.form.getRawValue();
    this.dialogRef.close({
      title: value.title,
      year: this.data.year,
      metric: value.metric || null,
      direction: value.direction,
      target: Number(value.target),
    });
  }
}
