import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoPipe } from '@jsverse/transloco';
import { HEALTH_STUDY_KINDS, HealthRecord, HealthStudy, HealthStudyKind } from '@pd/contracts';
import { HealthApi } from '../health.api';
import { orNull, today } from '../health-labels';

export interface StudyDialogData {
  record: HealthRecord;
  study?: HealthStudy;
  visitId?: string;
  day?: string;
}

/** Adds or changes a study (ultrasound, MRI, ECG…) with its conclusion. */
@Component({
  selector: 'pd-health-study-dialog',
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
      {{ (data.study ? 'health.study.edit' : 'health.study.add') | transloco }}
    </h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content class="form">
        <div class="row">
          <mat-form-field>
            <mat-label>{{ 'health.study.kind' | transloco }}</mat-label>
            <mat-select formControlName="kind">
              @for (kind of kinds; track kind) {
                <mat-option [value]="kind">{{
                  'health.studyKinds.' + kind | transloco
                }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'health.study.area' | transloco }}</mat-label>
            <input matInput maxlength="200" formControlName="area" />
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'health.study.date' | transloco }}</mat-label>
            <input matInput type="date" formControlName="performedOn" required />
          </mat-form-field>
        </div>
        <mat-form-field>
          <mat-label>{{ 'health.study.conclusion' | transloco }}</mat-label>
          <textarea matInput rows="5" maxlength="10000" formControlName="conclusion"></textarea>
        </mat-form-field>
        <div class="row">
          <mat-form-field>
            <mat-label>{{ 'health.visit.one' | transloco }}</mat-label>
            <mat-select formControlName="visitId">
              <mat-option [value]="''">—</mat-option>
              @for (visit of data.record.visits; track visit.id) {
                <mat-option [value]="visit.id">{{ visit.visitedOn }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'health.document.one' | transloco }}</mat-label>
            <mat-select formControlName="documentId">
              <mat-option [value]="''">—</mat-option>
              @for (document of data.record.documents; track document.id) {
                <mat-option [value]="document.id">{{ document.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        </div>
        <mat-form-field>
          <mat-label>{{ 'health.visit.notes' | transloco }}</mat-label>
          <textarea matInput rows="2" maxlength="5000" formControlName="notes"></textarea>
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
      flex: 1 1 160px;
    }
    .error {
      color: var(--mat-sys-error);
    }
  `,
})
export class StudyDialog {
  protected readonly data = inject<StudyDialogData>(MAT_DIALOG_DATA);
  private readonly api = inject(HealthApi);
  private readonly ref = inject(MatDialogRef<StudyDialog, boolean>);

  protected readonly kinds = HEALTH_STUDY_KINDS;
  protected readonly busy = signal(false);
  protected readonly error = signal(false);

  private readonly study = this.data.study;
  protected readonly form = inject(NonNullableFormBuilder).group({
    kind: (this.study?.kind ?? 'ultrasound') as HealthStudyKind,
    area: this.study?.area ?? '',
    performedOn: [this.study?.performedOn ?? this.data.day ?? today(), Validators.required],
    conclusion: this.study?.conclusion ?? '',
    visitId: this.study?.visitId ?? this.data.visitId ?? '',
    documentId: this.study?.documentId ?? '',
    notes: this.study?.notes ?? '',
  });

  protected async save(): Promise<void> {
    const value = this.form.getRawValue();
    this.busy.set(true);
    this.error.set(false);
    try {
      await this.api.client.saveStudy(
        {
          kind: value.kind,
          area: orNull(value.area),
          performedOn: value.performedOn,
          conclusion: orNull(value.conclusion),
          visitId: orNull(value.visitId),
          documentId: orNull(value.documentId),
          notes: orNull(value.notes),
        },
        this.study?.id,
      );
      this.ref.close(true);
    } catch {
      this.error.set(true);
    } finally {
      this.busy.set(false);
    }
  }
}
