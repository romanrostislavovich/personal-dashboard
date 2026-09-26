import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { TranslocoPipe } from '@jsverse/transloco';
import { Project, RecurringPayment, RecurringPaymentInput } from '@pd/contracts';

export interface RecurringPaymentFormData {
  payment: RecurringPayment | null;
  projects: Project[];
  categories: string[];
  defaults: { currency: string; projectId: string | null };
}

@Component({
  selector: 'pd-recurring-payment-form-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatAutocompleteModule,
    MatSlideToggleModule,
    MatButtonModule,
    TranslocoPipe,
  ],
  template: `
    <h2 mat-dialog-title>
      {{ (data.payment ? 'finance.recurring.edit' : 'finance.recurring.add') | transloco }}
    </h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content class="form">
        <mat-form-field>
          <mat-label>{{ 'finance.recurring.name' | transloco }}</mat-label>
          <input
            matInput
            formControlName="name"
            [placeholder]="'finance.recurring.namePlaceholder' | transloco"
            cdkFocusInitial
          />
        </mat-form-field>

        <div class="row">
          <mat-form-field>
            <mat-label>{{ 'finance.amount' | transloco }}</mat-label>
            <input matInput type="number" min="0.01" step="0.01" formControlName="amount" />
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'finance.currency' | transloco }}</mat-label>
            <input matInput formControlName="currency" maxlength="3" />
          </mat-form-field>
        </div>

        <div class="row">
          <mat-form-field>
            <mat-label>{{ 'finance.recurring.dayOfMonth' | transloco }}</mat-label>
            <input matInput type="number" min="1" max="31" formControlName="dayOfMonth" />
            <mat-hint>{{ 'finance.recurring.dayHint' | transloco }}</mat-hint>
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'finance.category' | transloco }}</mat-label>
            <input matInput formControlName="category" [matAutocomplete]="categoryList" />
            <mat-autocomplete #categoryList>
              @for (category of data.categories; track category) {
                <mat-option [value]="category">{{ category }}</mat-option>
              }
            </mat-autocomplete>
          </mat-form-field>
        </div>

        <mat-form-field>
          <mat-label>{{ 'finance.wallet' | transloco }}</mat-label>
          <mat-select formControlName="projectId">
            <mat-option [value]="null">{{ 'finance.scope.personal' | transloco }}</mat-option>
            @for (project of data.projects; track project.id) {
              <mat-option [value]="project.id">{{ project.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-slide-toggle formControlName="isActive">{{
          'finance.recurring.active' | transloco
        }}</mat-slide-toggle>
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
    mat-slide-toggle {
      margin-top: 8px;
    }
  `,
})
export class RecurringPaymentFormDialog {
  protected readonly data = inject<RecurringPaymentFormData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(
    MatDialogRef<RecurringPaymentFormDialog, RecurringPaymentInput>,
  );

  private readonly initial = this.data.payment;
  protected readonly form = inject(NonNullableFormBuilder).group({
    name: [this.initial?.name ?? '', Validators.required],
    amount: [
      this.initial?.amount ?? (null as number | null),
      [Validators.required, Validators.min(0.01)],
    ],
    currency: [
      this.initial?.currency ?? this.data.defaults.currency,
      [Validators.required, Validators.pattern(/^[A-Za-z]{3}$/)],
    ],
    category: [this.initial?.category ?? '', Validators.required],
    dayOfMonth: [
      this.initial?.dayOfMonth ?? 1,
      [Validators.required, Validators.min(1), Validators.max(31)],
    ],
    projectId: [this.initial ? this.initial.projectId : this.data.defaults.projectId],
    isActive: [this.initial?.isActive ?? true],
  });

  save(): void {
    const value = this.form.getRawValue();
    this.dialogRef.close({
      ...value,
      amount: Number(value.amount),
      currency: value.currency.toUpperCase(),
    });
  }
}
