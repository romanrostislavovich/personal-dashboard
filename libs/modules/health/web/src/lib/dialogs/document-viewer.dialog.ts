import { ChangeDetectionStrategy, Component, inject, OnDestroy, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { TranslocoPipe } from '@jsverse/transloco';
import { HealthDocument } from '@pd/contracts';
import { HealthApi } from '../health.api';

/**
 * The original of a document, shown over the page: a picture or a PDF. It stays inside the
 * app — a new tab is not there in the desktop app, where the file used to take the whole
 * window with no way back.
 */
@Component({
  selector: 'pd-health-document-viewer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatDialogModule, MatIconModule, MatProgressBarModule, TranslocoPipe],
  template: `
    <h2 mat-dialog-title>{{ data.name }}</h2>
    <mat-dialog-content class="original">
      @if (imageUrl(); as url) {
        <img [src]="url" [alt]="data.name" />
      } @else if (pdfUrl(); as url) {
        <iframe [src]="url" [title]="data.name"></iframe>
      } @else {
        <mat-progress-bar mode="indeterminate" />
      }
    </mat-dialog-content>
    <mat-dialog-actions>
      <button matButton type="button" [disabled]="!objectUrl()" (click)="download()">
        <mat-icon>download</mat-icon> {{ 'health.document.download' | transloco }}
      </button>
      <span class="spacer"></span>
      <button matButton="filled" type="button" mat-dialog-close>
        {{ 'health.document.close' | transloco }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .original {
      width: min(1100px, 90vw);
      max-height: 80vh;
    }
    img {
      display: block;
      max-width: 100%;
      max-height: 75vh;
      margin: 0 auto;
      border-radius: var(--pd-radius-small);
    }
    iframe {
      width: 100%;
      height: 75vh;
      border: 1px solid var(--pd-border);
      border-radius: var(--pd-radius-small);
    }
    .spacer {
      flex: 1;
    }
  `,
})
export class DocumentViewerDialog implements OnDestroy {
  protected readonly data = inject<HealthDocument>(MAT_DIALOG_DATA);
  private readonly api = inject(HealthApi);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly objectUrl = signal<string | null>(null);
  protected readonly imageUrl = signal<string | null>(null);
  protected readonly pdfUrl = signal<SafeResourceUrl | null>(null);

  constructor() {
    void this.load();
  }

  ngOnDestroy(): void {
    const url = this.objectUrl();
    if (url) {
      URL.revokeObjectURL(url);
    }
  }

  protected download(): void {
    const url = this.objectUrl();
    if (url) {
      const link = document.createElement('a');
      link.href = url;
      link.download = this.data.name;
      link.click();
    }
  }

  private async load(): Promise<void> {
    const blob = await this.api.client.documentFile(this.data.id);
    const url = URL.createObjectURL(blob);
    this.objectUrl.set(url);
    if (this.data.mimeType === 'application/pdf') {
      // Our own blob of the user's own file: safe to show in the frame.
      this.pdfUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(url));
    } else {
      this.imageUrl.set(url);
    }
  }
}
