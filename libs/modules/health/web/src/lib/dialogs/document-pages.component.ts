import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  OnDestroy,
  output,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { TranslocoPipe } from '@jsverse/transloco';
import { HealthDocument } from '@pd/contracts';
import { HealthApi } from '../health.api';

/**
 * The original of a document, page by page: a photo, or a PDF in the browser's own viewer
 * (which has its own pages). Under it — the page and the way to the others, a download of the
 * page and, where it may be taken out, its removal.
 */
@Component({
  selector: 'pd-health-document-pages',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, MatProgressBarModule, TranslocoPipe],
  template: `
    <div class="page">
      @if (imageUrl(); as url) {
        <img [src]="url" [alt]="document().name" />
      } @else if (pdfUrl(); as url) {
        <iframe [src]="url" [title]="document().name"></iframe>
      } @else {
        <mat-progress-bar mode="indeterminate" />
      }
    </div>
    <div class="bar">
      @if (document().pages > 1) {
        <button
          matIconButton
          type="button"
          [disabled]="page() === 1"
          [attr.aria-label]="'health.document.previous' | transloco"
          (click)="page.set(page() - 1)"
        >
          <mat-icon>chevron_left</mat-icon>
        </button>
        <span>
          {{ 'health.document.page' | transloco: { page: page(), pages: document().pages } }}
        </span>
        <button
          matIconButton
          type="button"
          [disabled]="page() === document().pages"
          [attr.aria-label]="'health.document.next' | transloco"
          (click)="page.set(page() + 1)"
        >
          <mat-icon>chevron_right</mat-icon>
        </button>
      }
      <span class="spacer"></span>
      @if (removable() && page() > 1) {
        <button matButton type="button" [disabled]="busy()" (click)="removePage()">
          <mat-icon>delete</mat-icon> {{ 'health.document.removePage' | transloco }}
        </button>
      }
      <button matButton type="button" [disabled]="!objectUrl" (click)="download()">
        <mat-icon>download</mat-icon> {{ 'health.document.download' | transloco }}
      </button>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    img {
      display: block;
      max-width: 100%;
      max-height: 70vh;
      margin: 0 auto;
      border-radius: var(--pd-radius-small);
    }
    iframe {
      width: 100%;
      height: 70vh;
      border: 1px solid var(--pd-border);
      border-radius: var(--pd-radius-small);
    }
    .bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px;
    }
    .spacer {
      flex: 1;
    }
  `,
})
export class DocumentPagesComponent implements OnDestroy {
  readonly document = input.required<HealthDocument>();
  /** A page after the first may be taken out (the viewer, not the draft being checked). */
  readonly removable = input(false);
  /** The document after a page was taken out. */
  readonly changed = output<HealthDocument>();

  private readonly api = inject(HealthApi);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly page = signal(1);
  protected readonly imageUrl = signal<string | null>(null);
  protected readonly pdfUrl = signal<SafeResourceUrl | null>(null);
  protected readonly busy = signal(false);
  protected objectUrl: string | null = null;

  constructor() {
    // A new page (or the document after a removal): its file is fetched again.
    effect(() => void this.show(this.document(), this.page()));
  }

  ngOnDestroy(): void {
    this.release();
  }

  protected download(): void {
    if (this.objectUrl) {
      const link = document.createElement('a');
      link.href = this.objectUrl;
      const pages = this.document().pages;
      link.download = pages > 1 ? `${this.document().name} (${this.page()})` : this.document().name;
      link.click();
    }
  }

  protected async removePage(): Promise<void> {
    this.busy.set(true);
    try {
      const page = this.page();
      const document = await this.api.client.removeDocumentPage(this.document().id, page);
      this.page.set(Math.min(page, document.pages));
      this.changed.emit(document);
    } finally {
      this.busy.set(false);
    }
  }

  private async show(document: HealthDocument, page: number): Promise<void> {
    this.release();
    const blob = await this.api.client.documentFile(document.id, page);
    // Another page may have been asked for meanwhile: this one is not shown then.
    if (page !== this.page() || document !== this.document()) {
      return;
    }
    this.objectUrl = URL.createObjectURL(blob);
    if (document.mimeType === 'application/pdf') {
      // Our own blob of the user's own file: safe to show in the frame.
      this.pdfUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(this.objectUrl));
    } else {
      this.imageUrl.set(this.objectUrl);
    }
  }

  private release(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    this.imageUrl.set(null);
    this.pdfUrl.set(null);
  }
}
