import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { TranslocoPipe } from '@jsverse/transloco';
import { HealthDocument } from '@pd/contracts';
import { DocumentPagesComponent } from './document-pages.component';

/**
 * The original of a document, shown over the page, page by page. It stays inside the app — a
 * new tab is not there in the desktop app, where the file used to take the whole window with
 * no way back. Closes with `true` when a page was taken out, so the history is read again.
 */
@Component({
  selector: 'pd-health-document-viewer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DocumentPagesComponent, MatButtonModule, MatDialogModule, TranslocoPipe],
  template: `
    <h2 mat-dialog-title>{{ document().name }}</h2>
    <mat-dialog-content class="original">
      <pd-health-document-pages
        [document]="document()"
        [removable]="true"
        (changed)="document.set($event); changed = true"
      />
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton="filled" type="button" (click)="close()">
        {{ 'health.document.close' | transloco }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .original {
      width: min(1100px, 90vw);
      max-height: 85vh;
    }
  `,
})
export class DocumentViewerDialog {
  private readonly ref = inject(MatDialogRef<DocumentViewerDialog, boolean>);
  protected readonly document = signal(inject<HealthDocument>(MAT_DIALOG_DATA));
  protected changed = false;

  protected close(): void {
    this.ref.close(this.changed);
  }
}
