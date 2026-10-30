import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import {
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {TranslocoPipe} from '@jsverse/transloco';
import {
  HealthMedication,
  HealthRecord,
  parseReminderTimes,
} from '@pd/contracts';
import {withDefaults} from '@pd/web-core';
import {HealthApi} from '../health.api';
import {orNull} from '../health-labels';

export interface MedicationDialogData {
  record: HealthRecord;
  medication?: HealthMedication;
  /** A medication prescribed at a visit: its id and day. */
  visitId?: string;
  day?: string;
}

/** Adds or changes a medication; closes with `true` once saved. */
@Component({
  selector: 'pd-health-medication-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    ReactiveFormsModule,
    TranslocoPipe,
  ],
  template: `
    <h2 mat-dialog-title>
      {{
        (data.medication ? 'health.medication.edit' : 'health.medication.add')
          | transloco
      }}
    </h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content class="form">
        <div class="row">
          <mat-form-field>
            <mat-label>{{ 'health.medication.name' | transloco }}</mat-label>
            <input matInput maxlength="200" formControlName="name" required />
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{
              'health.medication.substance' | transloco
            }}</mat-label>
            <input matInput maxlength="200" formControlName="substance" />
            <mat-hint>{{
              'health.medication.substanceHint' | transloco
            }}</mat-hint>
          </mat-form-field>
        </div>
        <div class="row">
          <mat-form-field>
            <mat-label>{{ 'health.medication.dose' | transloco }}</mat-label>
            <input matInput maxlength="200" formControlName="dose" />
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{
              'health.medication.schedule' | transloco
            }}</mat-label>
            <input matInput maxlength="500" formControlName="schedule" />
          </mat-form-field>
        </div>
        <div class="row">
          <mat-form-field>
            <mat-label>{{
              'health.medication.startedOn' | transloco
            }}</mat-label>
            <input matInput type="date" formControlName="startedOn" />
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{
              'health.medication.stoppedOn' | transloco
            }}</mat-label>
            <input
              matInput
              type="date"
              formControlName="stoppedOn"
              [min]="form.controls.startedOn.value"
            />
            <mat-hint>{{
              'health.medication.stoppedHint' | transloco
            }}</mat-hint>
          </mat-form-field>
        </div>
        @if (form.controls.stoppedOn.value) {
          <mat-form-field>
            <mat-label>{{
              'health.medication.stopReason' | transloco
            }}</mat-label>
            <input matInput maxlength="1000" formControlName="stopReason" />
          </mat-form-field>
        }
        <mat-form-field>
          <mat-label>{{ 'health.medication.reminders' | transloco }}</mat-label>
          <input
            matInput
            maxlength="100"
            formControlName="reminders"
            placeholder="08:00, 20:00"
          />
          <mat-hint>{{
            'health.medication.remindersHint' | transloco
          }}</mat-hint>
        </mat-form-field>
        <mat-form-field>
          <mat-label>{{
            'health.medication.prescribedAt' | transloco
          }}</mat-label>
          <mat-select formControlName="visitId">
            <mat-option [value]="''">—</mat-option>
            @for (visit of data.record.visits; track visit.id) {
              <mat-option [value]="visit.id">{{ visit.visitedOn }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field>
          <mat-label>{{ 'health.visit.notes' | transloco }}</mat-label>
          <textarea
            matInput
            rows="2"
            maxlength="5000"
            formControlName="notes"
          ></textarea>
        </mat-form-field>
        @if (error()) {
          <p class="error" role="alert">
            {{ 'health.errors.save' | transloco }}
          </p>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton type="button" mat-dialog-close>
          {{ 'core.actions.cancel' | transloco }}
        </button>
        <button
          matButton="filled"
          type="submit"
          [disabled]="form.invalid || busy()"
        >
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
      min-width: min(520px, 80vw);
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }
    .row > * {
      flex: 1 1 200px;
    }
    .error {
      color: var(--mat-sys-error);
    }
  `,
})
export class MedicationDialog {
  protected readonly data = inject<MedicationDialogData>(MAT_DIALOG_DATA);
  private readonly api = inject(HealthApi);
  private readonly ref = inject(MatDialogRef<MedicationDialog, boolean>);

  protected readonly busy = signal(false);
  protected readonly error = signal(false);

  private readonly medication = this.data.medication;
  /** The medication being edited, else what the dialog was opened with (a day, a visit). */
  private readonly initial = withDefaults(this.medication, {
    name: '',
    substance: '',
    dose: '',
    schedule: '',
    startedOn: this.data.day ?? '',
    stoppedOn: '',
    stopReason: '',
    visitId: this.data.visitId ?? '',
    notes: '',
  });
  protected readonly form = inject(NonNullableFormBuilder).group({
    name: [this.initial.name, Validators.required],
    substance: this.initial.substance,
    dose: this.initial.dose,
    schedule: this.initial.schedule,
    startedOn: this.initial.startedOn,
    stoppedOn: this.initial.stoppedOn,
    stopReason: this.initial.stopReason,
    visitId: this.initial.visitId,
    notes: this.initial.notes,
    reminders: this.medication?.reminderTimes.join(', ') ?? '',
  });

  protected async save(): Promise<void> {
    const value = this.form.getRawValue();
    this.busy.set(true);
    this.error.set(false);
    try {
      await this.api.client.saveMedication(
        {
          name: value.name.trim(),
          substance: orNull(value.substance),
          dose: orNull(value.dose),
          schedule: orNull(value.schedule),
          startedOn: orNull(value.startedOn),
          stoppedOn: orNull(value.stoppedOn),
          stopReason: value.stoppedOn ? orNull(value.stopReason) : null,
          visitId: orNull(value.visitId),
          notes: orNull(value.notes),
          // Reminders only while it is taken.
          reminderTimes: value.stoppedOn
            ? []
            : parseReminderTimes(value.reminders),
        },
        this.medication?.id,
      );
      this.ref.close(true);
    } catch {
      this.error.set(true);
    } finally {
      this.busy.set(false);
    }
  }
}
