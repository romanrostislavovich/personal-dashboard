import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  Birthday,
  BirthdayInput,
  MEMORIAL_REMINDER_DEFAULT,
  REMINDER_DAY_OPTIONS,
} from '@pd/contracts';

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

/** A date is a day and a month together, and a person needs at least one of the two dates. */
function wholeDates(form: AbstractControl): ValidationErrors | null {
  const { day, month, deathDay, deathMonth } = form.value as Record<string, number | null>;
  const half = (d: number | null, m: number | null) => Boolean(d) !== Boolean(m);
  if (half(day, month) || half(deathDay, deathMonth)) {
    return { halfDate: true };
  }
  return day || deathDay ? null : { noDate: true };
}

/**
 * A person and the dates to remember: the birthday and, for someone who has died, the day they
 * died. Either may be left empty, not both.
 */
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

        <h3>{{ 'birthdays.birthday' | transloco }}</h3>
        <div class="row">
          <mat-form-field>
            <mat-label>{{ 'birthdays.day' | transloco }}</mat-label>
            <input matInput type="number" min="1" max="31" formControlName="day" />
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'birthdays.month' | transloco }}</mat-label>
            <mat-select formControlName="month">
              <mat-option [value]="null">—</mat-option>
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
        @if (!form.controls.deathDay.value) {
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
        }

        <h3>{{ 'birthdays.death' | transloco }}</h3>
        <p class="hint">{{ 'birthdays.deathHint' | transloco }}</p>
        <div class="row">
          <mat-form-field>
            <mat-label>{{ 'birthdays.day' | transloco }}</mat-label>
            <input matInput type="number" min="1" max="31" formControlName="deathDay" />
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'birthdays.month' | transloco }}</mat-label>
            <mat-select formControlName="deathMonth">
              <mat-option [value]="null">—</mat-option>
              @for (month of months; track month) {
                <mat-option [value]="month">{{
                  'birthdays.months.' + month | transloco
                }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'birthdays.year' | transloco }}</mat-label>
            <input matInput type="number" formControlName="deathYear" />
            <mat-hint>{{ 'birthdays.yearHint' | transloco }}</mat-hint>
          </mat-form-field>
        </div>
        @if (form.controls.deathDay.value) {
          <mat-form-field>
            <mat-label>{{ 'birthdays.memorialRemind' | transloco }}</mat-label>
            <mat-select formControlName="memorialRemindDaysBefore" multiple>
              @for (days of reminderOptions; track days) {
                <mat-option [value]="days">{{
                  'birthdays.memorialRemindOption.' + days | transloco
                }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        }

        <mat-form-field>
          <mat-label>{{ 'birthdays.note' | transloco }}</mat-label>
          <textarea
            matInput
            formControlName="note"
            rows="2"
            [placeholder]="'birthdays.notePlaceholder' | transloco"
          ></textarea>
        </mat-form-field>
        @if (form.hasError('noDate') && form.dirty) {
          <p class="hint error">{{ 'birthdays.noDate' | transloco }}</p>
        }
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
    h3 {
      margin: 4px 0 8px;
      font: var(--mat-sys-title-small);
    }
    .hint {
      margin: -4px 0 8px;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .error {
      color: var(--mat-sys-error);
    }
  `,
})
export class BirthdayFormDialog {
  protected readonly birthday = inject<Birthday | null>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<BirthdayFormDialog, BirthdayInput>);
  protected readonly months = MONTHS;
  protected readonly reminderOptions = REMINDER_DAY_OPTIONS;

  private readonly dayOfMonth = [Validators.min(1), Validators.max(31)];
  protected readonly form = inject(NonNullableFormBuilder).group(
    {
      name: [this.birthday?.name ?? '', Validators.required],
      // A new person starts with a birthday to fill in; an existing one shows what is known.
      day: [this.birthday ? this.birthday.day : (1 as number | null), this.dayOfMonth],
      month: [this.birthday ? this.birthday.month : (1 as number | null)],
      year: [this.birthday?.year ?? (null as number | null)],
      remindDaysBefore: [this.birthday?.remindDaysBefore ?? [0, 1, 7]],
      deathDay: [this.birthday?.deathDay ?? (null as number | null), this.dayOfMonth],
      deathMonth: [this.birthday?.deathMonth ?? (null as number | null)],
      deathYear: [this.birthday?.deathYear ?? (null as number | null)],
      memorialRemindDaysBefore: [
        this.birthday?.memorialRemindDaysBefore ?? MEMORIAL_REMINDER_DEFAULT,
      ],
      note: [this.birthday?.note ?? ''],
    },
    { validators: wholeDates },
  );

  save(): void {
    const value = this.form.getRawValue();
    this.dialogRef.close({
      ...value,
      // An emptied number field gives null or '': both mean "not known".
      day: value.day || null,
      month: value.month || null,
      year: value.year || null,
      deathDay: value.deathDay || null,
      deathMonth: value.deathMonth || null,
      deathYear: value.deathYear || null,
      note: value.note || null,
    });
  }
}
