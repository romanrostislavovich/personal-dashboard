import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoPipe } from '@jsverse/transloco';
import { GOAL_WALLET_PERSONAL, Project, SavingsGoal, SavingsGoalInput } from '@pd/contracts';
import { todayLocalDate } from '@pd/web-core';

export interface GoalFormData {
  goal: SavingsGoal | null;
  projects: Project[];
  currency: string;
}

/** "Not tied to a wallet": mat-select treats null as no selection. */
const NO_WALLET = '';

/** A new savings goal or changes to one. */
@Component({
  selector: 'pd-goal-form-dialog',
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
      {{ (data.goal ? 'finance.goals.edit' : 'finance.goals.add') | transloco }}
    </h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content class="form">
        <mat-form-field>
          <mat-label>{{ 'finance.goals.name' | transloco }}</mat-label>
          <input
            matInput
            formControlName="name"
            [placeholder]="'finance.goals.namePlaceholder' | transloco"
            cdkFocusInitial
          />
        </mat-form-field>

        <div class="row">
          <mat-form-field>
            <mat-label>{{ 'finance.goals.target' | transloco }}</mat-label>
            <input matInput type="number" min="1" step="1" formControlName="target" />
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'finance.currency' | transloco }}</mat-label>
            <input matInput formControlName="currency" maxlength="3" />
          </mat-form-field>
        </div>

        <div class="row">
          <mat-form-field>
            <mat-label>{{ 'finance.goals.startedOn' | transloco }}</mat-label>
            <input matInput type="date" formControlName="startedOn" />
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'finance.goals.deadline' | transloco }}</mat-label>
            <input matInput type="date" formControlName="deadline" />
          </mat-form-field>
        </div>

        <mat-form-field>
          <mat-label>{{ 'finance.goals.wallet' | transloco }}</mat-label>
          <mat-select formControlName="wallet">
            <mat-option [value]="noWallet">{{ 'finance.goals.byHand' | transloco }}</mat-option>
            <mat-option [value]="personal">{{ 'finance.scope.personal' | transloco }}</mat-option>
            @for (project of data.projects; track project.id) {
              <mat-option [value]="project.id">{{ project.name }}</mat-option>
            }
          </mat-select>
          <mat-hint>{{ 'finance.goals.walletHint' | transloco }}</mat-hint>
        </mat-form-field>
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
      min-width: min(440px, 80vw);
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
  private readonly dialogRef = inject(MatDialogRef<GoalFormDialog, SavingsGoalInput>);
  protected readonly noWallet = NO_WALLET;
  protected readonly personal = GOAL_WALLET_PERSONAL;

  private readonly goal = this.data.goal;
  protected readonly form = inject(NonNullableFormBuilder).group({
    name: [this.goal?.name ?? '', Validators.required],
    target: [
      this.goal?.target ?? (null as number | null),
      [Validators.required, Validators.min(1)],
    ],
    currency: [
      this.goal?.currency ?? this.data.currency,
      [Validators.required, Validators.pattern(/^[A-Za-z]{3}$/)],
    ],
    startedOn: [this.goal?.startedOn ?? todayLocalDate(), Validators.required],
    deadline: [this.goal?.deadline ?? ''],
    wallet: [this.goal ? (this.goal.wallet ?? NO_WALLET) : GOAL_WALLET_PERSONAL],
  });

  save(): void {
    const value = this.form.getRawValue();
    this.dialogRef.close({
      ...value,
      target: Number(value.target),
      currency: value.currency.toUpperCase(),
      deadline: value.deadline || null,
      wallet: value.wallet || null,
    });
  }
}
