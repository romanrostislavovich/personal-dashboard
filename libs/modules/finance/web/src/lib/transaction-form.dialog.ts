import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoPipe } from '@jsverse/transloco';
import { Project, Transaction, TransactionInput, TransactionKind } from '@pd/contracts';
import { todayLocalDate } from '@pd/web-core';

export interface TransactionFormData {
  transaction: Transaction | null;
  projects: Project[];
  /** Уже использованные категории — для автодополнения. */
  categories: string[];
  defaults: { currency: string; projectId: string | null };
}

@Component({
  selector: 'pd-transaction-form-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatAutocompleteModule,
    MatButtonToggleModule,
    MatButtonModule,
    TranslocoPipe,
  ],
  template: `
    <h2 mat-dialog-title>
      {{ (data.transaction ? 'finance.transaction.edit' : 'finance.transaction.add') | transloco }}
    </h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content class="form">
        <mat-button-toggle-group formControlName="kind" class="kind">
          <mat-button-toggle value="expense">{{
            'finance.kind.expense' | transloco
          }}</mat-button-toggle>
          <mat-button-toggle value="income">{{
            'finance.kind.income' | transloco
          }}</mat-button-toggle>
        </mat-button-toggle-group>

        <div class="row">
          <mat-form-field>
            <mat-label>{{ 'finance.amount' | transloco }}</mat-label>
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
            <mat-label>{{ 'finance.currency' | transloco }}</mat-label>
            <input matInput formControlName="currency" maxlength="3" />
          </mat-form-field>
        </div>

        <mat-form-field>
          <mat-label>{{ 'finance.category' | transloco }}</mat-label>
          <input matInput formControlName="category" [matAutocomplete]="categoryList" />
          <mat-autocomplete #categoryList>
            @for (category of data.categories; track category) {
              <mat-option [value]="category">{{ category }}</mat-option>
            }
          </mat-autocomplete>
        </mat-form-field>

        <div class="row">
          <mat-form-field>
            <mat-label>{{ 'finance.date' | transloco }}</mat-label>
            <input matInput type="date" formControlName="occurredOn" />
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'finance.wallet' | transloco }}</mat-label>
            <mat-select formControlName="projectId">
              <!-- "Личное" = пустая строка: null mat-select считает отсутствием выбора. -->
              <mat-option value="">{{ 'finance.scope.personal' | transloco }}</mat-option>
              @for (project of data.projects; track project.id) {
                <mat-option [value]="project.id">{{ project.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        </div>

        <mat-form-field>
          <mat-label>{{ 'finance.note' | transloco }}</mat-label>
          <input matInput formControlName="note" />
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
    .kind {
      margin-bottom: 16px;
      align-self: flex-start;
    }
    .row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
  `,
})
export class TransactionFormDialog {
  protected readonly data = inject<TransactionFormData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<TransactionFormDialog, TransactionInput>);

  private readonly initial = this.data.transaction;
  protected readonly form = inject(NonNullableFormBuilder).group({
    kind: [this.initial?.kind ?? ('expense' as TransactionKind)],
    amount: [
      this.initial?.amount ?? (null as number | null),
      [Validators.required, Validators.min(0.01)],
    ],
    currency: [
      this.initial?.currency ?? this.data.defaults.currency,
      [Validators.required, Validators.pattern(/^[A-Za-z]{3}$/)],
    ],
    category: [this.initial?.category ?? '', Validators.required],
    occurredOn: [this.initial?.occurredOn ?? todayLocalDate(), Validators.required],
    projectId: [(this.initial ? this.initial.projectId : this.data.defaults.projectId) ?? ''],
    note: [this.initial?.note ?? ''],
  });

  save(): void {
    const value = this.form.getRawValue();
    this.dialogRef.close({
      ...value,
      amount: Number(value.amount),
      currency: value.currency.toUpperCase(),
      note: value.note || null,
      projectId: value.projectId || null,
    });
  }
}
