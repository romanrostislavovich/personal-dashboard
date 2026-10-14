import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoPipe } from '@jsverse/transloco';
import { HEALTH_SPECIALITIES, HealthRecord, HealthVisit } from '@pd/contracts';
import { HealthApi } from '../health.api';
import { orNull, SpecialityPipe, today } from '../health-labels';
import { CountryFieldComponent } from './country-field.component';

export interface VisitDialogData {
  record: HealthRecord;
  visit?: HealthVisit;
}

/** Adds or changes a visit; closes with `true` once saved. */
@Component({
  selector: 'pd-health-visit-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CountryFieldComponent,
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
      {{ (data.visit ? 'health.visit.edit' : 'health.visit.add') | transloco }}
    </h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content class="form">
        <div class="row">
          <mat-form-field>
            <mat-label>{{ 'health.visit.date' | transloco }}</mat-label>
            <input matInput type="date" formControlName="visitedOn" required />
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'health.visit.doctor' | transloco }}</mat-label>
            <mat-select formControlName="doctorId" (selectionChange)="pickDoctor($event.value)">
              <mat-option [value]="''">—</mat-option>
              @for (doctor of data.record.doctors; track doctor.id) {
                <mat-option [value]="doctor.id">
                  {{ doctor.name }}
                  @if (doctor.speciality) {
                    · {{ doctor.speciality | pdSpeciality }}
                  }
                </mat-option>
              }
            </mat-select>
          </mat-form-field>
        </div>
        <div class="row">
          <mat-form-field>
            <mat-label>{{ 'health.visit.clinic' | transloco }}</mat-label>
            <mat-select formControlName="clinicId" (selectionChange)="pickClinic($event.value)">
              <mat-option [value]="''">—</mat-option>
              @for (clinic of data.record.clinics; track clinic.id) {
                <mat-option [value]="clinic.id">{{ clinic.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <pd-health-country-field formControlName="country" />
        </div>
        <div class="row">
          <mat-form-field>
            <mat-label>{{ 'health.doctor.speciality' | transloco }}</mat-label>
            <mat-select formControlName="speciality">
              <mat-option [value]="''">—</mat-option>
              @for (key of specialities; track key) {
                <mat-option [value]="key">{{ key | pdSpeciality }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'health.visit.language' | transloco }}</mat-label>
            <mat-select formControlName="language">
              <mat-option [value]="''">—</mat-option>
              @for (language of languages; track language) {
                <mat-option [value]="language">
                  {{ 'health.languages.' + language | transloco }}
                </mat-option>
              }
            </mat-select>
          </mat-form-field>
        </div>
        @for (field of texts; track field) {
          <mat-form-field>
            <mat-label>{{ 'health.visit.' + field | transloco }}</mat-label>
            <textarea matInput rows="3" maxlength="10000" [formControlName]="field"></textarea>
          </mat-form-field>
        }
        <mat-form-field class="next">
          <mat-label>{{ 'health.visit.nextVisitOn' | transloco }}</mat-label>
          <input matInput type="date" formControlName="nextVisitOn" />
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
      min-width: min(560px, 80vw);
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }
    .row > * {
      flex: 1 1 200px;
    }
    .next {
      max-width: 260px;
    }
    .error {
      color: var(--mat-sys-error);
    }
  `,
})
export class VisitDialog {
  protected readonly data = inject<VisitDialogData>(MAT_DIALOG_DATA);
  private readonly api = inject(HealthApi);
  private readonly ref = inject(MatDialogRef<VisitDialog, boolean>);

  /** The list, and what was typed by hand for a doctor or a visit before. */
  protected readonly specialities = [
    ...new Set([
      ...HEALTH_SPECIALITIES,
      ...this.data.record.doctors.map((d) => d.speciality ?? ''),
      this.data.visit?.speciality ?? '',
    ]),
  ].filter(Boolean);
  protected readonly languages = ['uk', 'ru', 'pl', 'en'];
  protected readonly texts = ['complaints', 'findings', 'recommendations', 'notes'] as const;
  protected readonly busy = signal(false);
  protected readonly error = signal(false);

  private readonly visit = this.data.visit;
  protected readonly form = inject(NonNullableFormBuilder).group({
    visitedOn: [this.visit?.visitedOn ?? today(), Validators.required],
    doctorId: this.visit?.doctorId ?? '',
    clinicId: this.visit?.clinicId ?? '',
    country: this.visit?.country ?? '',
    speciality: this.visit?.speciality ?? '',
    language: this.visit?.language ?? '',
    complaints: this.visit?.complaints ?? '',
    findings: this.visit?.findings ?? '',
    recommendations: this.visit?.recommendations ?? '',
    notes: this.visit?.notes ?? '',
    nextVisitOn: this.visit?.nextVisitOn ?? '',
  });

  /** A doctor brings their clinic and speciality, if those are still empty. */
  protected pickDoctor(id: string): void {
    const doctor = this.data.record.doctors.find((d) => d.id === id);
    if (doctor?.clinicId && !this.form.controls.clinicId.value) {
      this.form.controls.clinicId.setValue(doctor.clinicId);
      this.pickClinic(doctor.clinicId);
    }
    if (doctor?.speciality && !this.form.controls.speciality.value) {
      this.form.controls.speciality.setValue(doctor.speciality);
    }
  }

  protected pickClinic(id: string): void {
    const clinic = this.data.record.clinics.find((c) => c.id === id);
    if (clinic?.country && !this.form.controls.country.value) {
      this.form.controls.country.setValue(clinic.country);
    }
  }

  protected async save(): Promise<void> {
    const value = this.form.getRawValue();
    this.busy.set(true);
    this.error.set(false);
    try {
      await this.api.client.saveVisit(
        {
          visitedOn: value.visitedOn,
          doctorId: orNull(value.doctorId),
          clinicId: orNull(value.clinicId),
          country: orNull(value.country),
          speciality: orNull(value.speciality),
          language: orNull(value.language),
          complaints: orNull(value.complaints),
          findings: orNull(value.findings),
          recommendations: orNull(value.recommendations),
          notes: orNull(value.notes),
          nextVisitOn: orNull(value.nextVisitOn),
        },
        this.visit?.id,
      );
      this.ref.close(true);
    } catch {
      this.error.set(true);
    } finally {
      this.busy.set(false);
    }
  }
}
