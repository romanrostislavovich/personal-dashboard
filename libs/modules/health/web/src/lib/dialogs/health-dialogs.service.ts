import { inject, Injectable } from '@angular/core';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { ComponentType } from '@angular/cdk/portal';
import { TranslocoService } from '@jsverse/transloco';
import { HealthClinic, HealthDocument } from '@pd/contracts';
import { firstValueFrom } from 'rxjs';
import { DraftReviewData, DraftReviewDialog } from '../drafts/draft-review.dialog';
import { ClinicDialog } from './clinic.dialog';
import { DiagnosisDialog, DiagnosisDialogData } from './diagnosis.dialog';
import { DoctorDialog, DoctorDialogData } from './doctor.dialog';
import { DocumentDialog, DocumentDialogData } from './document.dialog';
import { DocumentViewerDialog } from './document-viewer.dialog';
import { LabPanelDialog, LabPanelDialogData } from './lab-panel.dialog';
import { MedicationDialog, MedicationDialogData } from './medication.dialog';
import { StudyDialog, StudyDialogData } from './study.dialog';
import { VisitDialog, VisitDialogData } from './visit.dialog';

/**
 * The dialogs of Health, for every page: each resolves `true` once something was saved, so the
 * page reloads the history.
 */
@Injectable({ providedIn: 'root' })
export class HealthDialogs {
  private readonly dialog = inject(MatDialog);
  private readonly transloco = inject(TranslocoService);

  visit(data: VisitDialogData) {
    return this.open(VisitDialog, data);
  }

  diagnosis(data: DiagnosisDialogData) {
    return this.open(DiagnosisDialog, data);
  }

  medication(data: MedicationDialogData) {
    return this.open(MedicationDialog, data);
  }

  document(data: DocumentDialogData) {
    return this.open(DocumentDialog, data);
  }

  labPanel(data: LabPanelDialogData) {
    return this.open(LabPanelDialog, data);
  }

  study(data: StudyDialogData) {
    return this.open(StudyDialog, data);
  }

  /** A document read by the AI, to check and save. */
  review(data: DraftReviewData) {
    return this.open(DraftReviewDialog, data, { maxWidth: '96vw' });
  }

  clinic(clinic: HealthClinic | null) {
    return this.open(ClinicDialog, clinic);
  }

  doctor(data: DoctorDialogData) {
    return this.open(DoctorDialog, data);
  }

  /** Asks first; `true` once it is gone (into the trash, for 30 days). */
  async remove(what: string, remove: () => Promise<unknown>): Promise<boolean> {
    if (!confirm(this.transloco.translate('health.confirmDelete', { what }))) {
      return false;
    }
    await remove();
    return true;
  }

  /** Shows the original over the page (see DocumentViewerDialog). */
  async openDocument(document: HealthDocument): Promise<void> {
    await this.open(DocumentViewerDialog, document, { autoFocus: 'dialog', maxWidth: '95vw' });
  }

  private async open<D, C>(
    component: ComponentType<C>,
    data: D,
    config: MatDialogConfig<D> = {},
  ): Promise<boolean> {
    const ref = this.dialog.open<C, D, boolean>(component, {
      data,
      autoFocus: 'first-tabbable',
      ...config,
    });
    return (await firstValueFrom(ref.afterClosed())) === true;
  }
}
