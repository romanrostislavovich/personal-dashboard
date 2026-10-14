import { inject, Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ComponentType } from '@angular/cdk/portal';
import { TranslocoService } from '@jsverse/transloco';
import { HealthClinic, HealthDocument } from '@pd/contracts';
import { firstValueFrom } from 'rxjs';
import { HealthApi } from '../health.api';
import { ClinicDialog } from './clinic.dialog';
import { DiagnosisDialog, DiagnosisDialogData } from './diagnosis.dialog';
import { DoctorDialog, DoctorDialogData } from './doctor.dialog';
import { DocumentDialog, DocumentDialogData } from './document.dialog';
import { MedicationDialog, MedicationDialogData } from './medication.dialog';
import { VisitDialog, VisitDialogData } from './visit.dialog';

/**
 * The dialogs of Health, for every page: each resolves `true` once something was saved, so the
 * page reloads the history.
 */
@Injectable({ providedIn: 'root' })
export class HealthDialogs {
  private readonly dialog = inject(MatDialog);
  private readonly api = inject(HealthApi);
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

  /** Opens the original in a new tab (a link cannot send the auth header, so it goes as a blob). */
  async openDocument(document: HealthDocument): Promise<void> {
    const tab = window.open('', '_blank');
    const blob = await this.api.client.documentFile(document.id);
    const url = URL.createObjectURL(blob);
    if (tab) {
      tab.location.href = url;
    } else {
      window.location.href = url;
    }
    // The tab has read it by then; the URL is not needed after.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  private async open<D, C>(component: ComponentType<C>, data: D): Promise<boolean> {
    const ref = this.dialog.open<C, D, boolean>(component, { data, autoFocus: 'first-tabbable' });
    return (await firstValueFrom(ref.afterClosed())) === true;
  }
}
