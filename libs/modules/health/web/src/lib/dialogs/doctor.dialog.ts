import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoPipe } from '@jsverse/transloco';
import { HEALTH_SPECIALITIES, HealthClinic, HealthDoctor } from '@pd/contracts';
import { HealthApi } from '../health.api';
import { orNull, SpecialityPipe } from '../health-labels';

export interface DoctorDialogData {
  clinics: HealthClinic[];
  doctor?: HealthDoctor;
}

/**
 * Adds or changes a doctor. The speciality is picked from the list (then it is shown in the
 * user's language) or typed as the document has it.
 */
@Component({
  selector: 'pd-health-doctor-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatAutocompleteModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    ReactiveFormsModule,
    SpecialityPipe,
    TranslocoPipe,
  ],
  template: `
    <h2 mat-dialog-title>
      {{ (data.doctor ? 'health.doctor.edit' : 'health.doctor.add') | transloco }}
    </h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content class="form">
        <mat-form-field>
          <mat-label>{{ 'health.doctor.name' | transloco }}</mat-label>
          <input matInput maxlength="200" formControlName="name" required />
        </mat-form-field>
        <mat-form-field>
          <mat-label>{{ 'health.doctor.speciality' | transloco }}</mat-label>
          <input
            matInput
            maxlength="100"
            formControlName="speciality"
            [matAutocomplete]="specialities"
          />
          <mat-autocomplete #specialities="matAutocomplete" [displayWith]="specialityName">
            @for (key of keys; track key) {
              <mat-option [value]="key">{{ key | pdSpeciality }}</mat-option>
            }
          </mat-autocomplete>
        </mat-form-field>
        <mat-form-field>
          <mat-label>{{ 'health.visit.clinic' | transloco }}</mat-label>
          <mat-select formControlName="clinicId">
            <mat-option [value]="''">—</mat-option>
            @for (clinic of data.clinics; track clinic.id) {
              <mat-option [value]="clinic.id">{{ clinic.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field>
          <mat-label>{{ 'health.contacts' | transloco }}</mat-label>
          <textarea matInput rows="2" maxlength="1000" formControlName="contacts"></textarea>
        </mat-form-field>
        @if (error()) {
          <p class="error" role="alert">{{ 'health.errors.save' | transloco }}</p>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton type="button" mat-dialog-close>
          {{ 'core.actions.cancel' | transloco }}
        </button>
        <button matButton="filled" type="submit" [disabled]="form.invalid || busy()">
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
      min-width: min(440px, 80vw);
    }
    .error {
      color: var(--mat-sys-error);
    }
  `,
})
export class DoctorDialog {
  protected readonly data = inject<DoctorDialogData>(MAT_DIALOG_DATA);
  private readonly api = inject(HealthApi);
  private readonly ref = inject(MatDialogRef<DoctorDialog, boolean>);
  private readonly speciality = new SpecialityPipe();

  protected readonly keys = HEALTH_SPECIALITIES;
  protected readonly busy = signal(false);
  protected readonly error = signal(false);
  protected readonly specialityName = (value: string | null) => this.speciality.transform(value);

  private readonly doctor = this.data.doctor;
  protected readonly form = inject(NonNullableFormBuilder).group({
    name: [this.doctor?.name ?? '', Validators.required],
    speciality: this.doctor?.speciality ?? '',
    clinicId: this.doctor?.clinicId ?? '',
    contacts: this.doctor?.contacts ?? '',
  });

  protected async save(): Promise<void> {
    const value = this.form.getRawValue();
    this.busy.set(true);
    this.error.set(false);
    try {
      await this.api.client.saveDoctor(
        {
          name: value.name.trim(),
          speciality: orNull(value.speciality),
          clinicId: orNull(value.clinicId),
          contacts: orNull(value.contacts),
        },
        this.doctor?.id,
      );
      this.ref.close(true);
    } catch {
      this.error.set(true);
    } finally {
      this.busy.set(false);
    }
  }
}
