import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { TranslocoPipe } from '@jsverse/transloco';
import { GoalContribution } from '@pd/contracts';
import { todayLocalDate } from '@pd/web-core';

export interface ContributionData {
  goalName: string;
  currency: string;
}

/** Money put into a goal by hand, or taken out of it. */
@Component({
  selector: 'pd-contribution-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatButtonToggleModule,
    TranslocoPipe,
  ],
  template: `
    <h2 mat-dialog-title>{{ data.goalName }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content class="form">
        <mat-button-toggle-group formControlName="direction" hideSingleSelectionIndicator>
          <mat-button-toggle value="in">{{ 'finance.goals.putIn' | transloco }}</mat-button-toggle>
          <mat-button-toggle value="out">{{
            'finance.goals.takeOut' | transloco
          }}</mat-button-toggle>
        </mat-button-toggle-group>
        <div class="row">
          <mat-form-field>
            <mat-label>{{ 'finance.amount' | transloco }} ({{ data.currency }})</mat-label>
            <input
              matInput
              type="number"
              min="0.01"
              step="0.01"
              formControlName="amount"
              cdkFocusInitial
            />
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'finance.goals.day' | transloco }}</mat-label>
            <input matInput type="date" formControlName="occurredOn" />
          </mat-form-field>
        </div>
        <mat-form-field>
          <mat-label>{{ 'finance.note' | transloco }}</mat-label>
          <input matInput formControlName="note" maxlength="200" />
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
      gap: 12px;
      min-width: min(400px, 80vw);
    }
    .row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
  `,
})
export class ContributionDialog {
  protected readonly data = inject<ContributionData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<ContributionDialog, GoalContribution>);

  protected readonly form = inject(NonNullableFormBuilder).group({
    direction: ['in' as 'in' | 'out'],
    amount: [null as number | null, [Validators.required, Validators.min(0.01)]],
    occurredOn: [todayLocalDate(), Validators.required],
    note: [''],
  });

  save(): void {
    const value = this.form.getRawValue();
    const amount = Number(value.amount);
    this.dialogRef.close({
      amount: value.direction === 'out' ? -amount : amount,
      occurredOn: value.occurredOn,
      note: value.note.trim() || null,
    });
  }
}
