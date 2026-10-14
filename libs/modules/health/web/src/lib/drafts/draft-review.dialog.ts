import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  DIAGNOSIS_STATUSES,
  HEALTH_DRAFT_KINDS,
  HEALTH_SPECIALITIES,
  HEALTH_STUDY_KINDS,
  HealthDocument,
  HealthDocumentDraft,
  HealthRecord,
} from '@pd/contracts';
import { errorBody } from '@pd/web-core';
import { CountryFieldComponent } from '../dialogs/country-field.component';
import { DocumentPagesComponent } from '../dialogs/document-pages.component';
import { HealthApi } from '../health.api';
import { SpecialityPipe, today } from '../health-labels';
import {
  diagnosisLine,
  DraftForm,
  draftForm,
  labLine,
  medicationLine,
  NEW,
  toApplyInput,
} from './draft-form';

export interface DraftReviewData {
  record: HealthRecord;
  document: HealthDocument;
}

/**
 * A document read by the AI, checked before anything is saved: the original on the left, what
 * was read out of it on the right, every field editable. Saving makes the visit (with its
 * clinic, doctor, diagnoses and medications), the lab report or the study in one go; the draft
 * can also be dropped. The AI only copies the document — the user is who decides it is right.
 */
@Component({
  selector: 'pd-health-draft-review-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DocumentPagesComponent,
    CountryFieldComponent,
    MatButtonModule,
    MatButtonToggleModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    ReactiveFormsModule,
    SpecialityPipe,
    TranslocoPipe,
  ],
  templateUrl: './draft-review.dialog.html',
  styleUrl: './draft-review.dialog.scss',
})
export class DraftReviewDialog {
  protected readonly data = inject<DraftReviewData>(MAT_DIALOG_DATA);
  private readonly api = inject(HealthApi);
  private readonly ref = inject(MatDialogRef<DraftReviewDialog, boolean>);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly kinds = HEALTH_DRAFT_KINDS;
  protected readonly statuses = DIAGNOSIS_STATUSES;
  protected readonly studyKinds = HEALTH_STUDY_KINDS;
  protected readonly specialities = HEALTH_SPECIALITIES;
  protected readonly languages = ['uk', 'ru', 'pl', 'en'];
  protected readonly NEW = NEW;

  protected readonly form = signal<DraftForm | null>(null);
  /** The translation key of why the document could not be read; `null` — it was. */
  protected readonly failure = signal<string | null>(null);
  protected readonly reading = signal(false);
  protected readonly busy = signal(false);
  protected readonly saveFailed = signal(false);

  constructor() {
    void this.load();
  }

  /** The draft kept, or the document read now. */
  private async load(): Promise<void> {
    try {
      const { draft } = await this.api.client.documentDraft(this.data.document.id);
      if (draft) {
        this.setDraft(draft);
      } else {
        await this.read();
      }
    } catch {
      this.failure.set('health.drafts.failed.aiFailed');
    }
  }

  protected async read(): Promise<void> {
    this.reading.set(true);
    this.failure.set(null);
    try {
      this.setDraft(await this.api.client.readDocument(this.data.document.id));
    } catch (error) {
      const code = (errorBody(error) as { code?: string } | null)?.code ?? 'aiFailed';
      this.failure.set(`health.drafts.failed.${code}`);
    } finally {
      this.reading.set(false);
    }
  }

  private setDraft(draft: HealthDocumentDraft): void {
    this.form.set(
      draftForm(
        this.fb,
        draft,
        { clinics: this.data.record.clinics, doctors: this.data.record.doctors },
        today(),
      ),
    );
  }

  protected addDiagnosis(form: DraftForm): void {
    form.controls.diagnoses.push(diagnosisLine(this.fb));
  }

  protected addMedication(form: DraftForm): void {
    form.controls.medications.push(medicationLine(this.fb));
  }

  protected addLabLine(form: DraftForm): void {
    form.controls.labValues.push(labLine(this.fb));
  }

  /** Only the parts saved with the kind picked have to be right: the rest is not saved. */
  protected valid(form: DraftForm): boolean {
    const { controls } = form;
    if (controls.day.invalid) {
      return false;
    }
    if (
      controls.kind.value !== 'other' &&
      !(controls.diagnoses.valid && controls.medications.valid)
    ) {
      return false;
    }
    switch (controls.kind.value) {
      case 'visit':
        return controls.labValues.valid;
      case 'labs':
        return controls.labValues.length > 0 && controls.labValues.valid;
      default:
        return true;
    }
  }

  protected async save(form: DraftForm): Promise<void> {
    this.busy.set(true);
    this.saveFailed.set(false);
    try {
      await this.api.client.applyDraft(toApplyInput(this.data.document.id, form));
      this.ref.close(true);
    } catch {
      this.saveFailed.set(true);
    } finally {
      this.busy.set(false);
    }
  }

  /** Nothing is saved; the document stays without its draft. */
  protected async drop(): Promise<void> {
    await this.api.client.dropDraft(this.data.document.id);
    this.ref.close(true);
  }
}
