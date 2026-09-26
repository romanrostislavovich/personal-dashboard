import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoPipe } from '@jsverse/transloco';
import { Birthday, BirthdayInput, REMINDER_DAY_OPTIONS } from '@pd/contracts';

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

@Component({
  selector: 'pd-birthday-form-dialog',
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
    <h2 mat-dialog-title>{{ (birthday ? 'birthdays.edit' : 'birthdays.add') | transloco }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content class="form">
        <mat-form-field>
          <mat-label>{{ 'birthdays.name' | transloco }}</mat-label>
          <input matInput formControlName="name" cdkFocusInitial />
        </mat-form-field>

        <div class="row">
          <mat-form-field>
            <mat-label>{{ 'birthdays.day' | transloco }}</mat-label>
            <input matInput type="number" min="1" max="31" formControlName="day" />
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'birthdays.month' | transloco }}</mat-label>
            <mat-select formControlName="month">
              @for (month of months; track month) {
                <mat-option [value]="month">{{
                  'birthdays.months.' + month | transloco
                }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'birthdays.year' | transloco }}</mat-label>
            <input matInput type="number" formControlName="year" />
            <mat-hint>{{ 'birthdays.yearHint' | transloco }}</mat-hint>
          </mat-form-field>
        </div>

        <mat-form-field>
          <mat-label>{{ 'birthdays.remind' | transloco }}</mat-label>
          <mat-select formControlName="remindDaysBefore" multiple>
            @for (days of reminderOptions; track days) {
              <mat-option [value]="days">{{
                'birthdays.remindOption.' + days | transloco
              }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field>
          <mat-label>{{ 'birthdays.note' | transloco }}</mat-label>
          <textarea
            matInput
            formControlName="note"
            rows="2"
            [placeholder]="'birthdays.notePlaceholder' | transloco"
          ></textarea>
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
      min-width: min(480px, 80vw);
    }
    .row {
      display: grid;
      grid-template-columns: 1fr 2fr 1.3fr;
      gap: 8px;
    }
  `,
})
export class BirthdayFormDialog {
  protected readonly birthday = inject<Birthday | null>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<BirthdayFormDialog, BirthdayInput>);

  protected readonly months = MONTHS;
  protected readonly reminderOptions = REMINDER_DAY_OPTIONS;

  protected readonly form = inject(NonNullableFormBuilder).group({
    name: [this.birthday?.name ?? '', Validators.required],
    day: [this.birthday?.day ?? 1, [Validators.required, Validators.min(1), Validators.max(31)]],
    month: [this.birthday?.month ?? 1, Validators.required],
    year: [this.birthday?.year ?? (null as number | null)],
    remindDaysBefore: [this.birthday?.remindDaysBefore ?? [0, 1, 7]],
    note: [this.birthday?.note ?? ''],
  });

  save(): void {
    const value = this.form.getRawValue();
    this.dialogRef.close({ ...value, year: value.year || null, note: value.note || null });
  }
}
