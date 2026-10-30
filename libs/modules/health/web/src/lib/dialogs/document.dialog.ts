import {
  ChangeDetectionStrategy,
  Component,
  computed,
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
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {TranslocoPipe} from '@jsverse/transloco';
import {
  HEALTH_DOCUMENT_KINDS,
  HEALTH_DOCUMENT_MAX_BYTES,
  HEALTH_DOCUMENT_MAX_PAGES,
  HEALTH_DOCUMENT_TYPES,
  HealthDocument,
  HealthDocumentKind,
  HealthRecord,
  isHealthPageType,
} from '@pd/contracts';
import {HealthApi} from '../health.api';
import {fileSize, orNull} from '../health-labels';

export interface DocumentDialogData {
  record: HealthRecord;
  /** Changes the description of a document kept; without it a file is added. */
  document?: HealthDocument;
  visitId?: string;
  day?: string;
}

/** Keeps a scan, a photo or a PDF of a document; closes with `true` once saved. */
@Component({
  selector: 'pd-health-document-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    ReactiveFormsModule,
    TranslocoPipe,
  ],
  template: `
    <h2 mat-dialog-title>
      {{
        (data.document ? 'health.document.edit' : 'health.document.add')
          | transloco
      }}
    </h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content class="form">
        @if (!data.document) {
          <div class="file">
            <button matButton="tonal" type="button" (click)="input.click()">
              <mat-icon>upload_file</mat-icon>
              {{ 'health.document.choose' | transloco }}
            </button>
            <input
              #input
              type="file"
              hidden
              multiple
              [accept]="types"
              (change)="choose($any($event.target).files)"
            />
            @if (files().length === 1) {
              <span>{{ files()[0].name }} · {{ size(files()[0].size) }}</span>
            } @else if (files().length > 1) {
              <span>{{
                'health.document.pages' | transloco: {count: files().length}
              }}</span>
            } @else {
              <span class="hint">{{
                'health.document.types' | transloco
              }}</span>
            }
          </div>
          <p class="hint">{{ 'health.document.pagesHint' | transloco }}</p>
        } @else if (takesPages) {
          <div class="file">
            <button matButton="tonal" type="button" (click)="pages.click()">
              <mat-icon>add_photo_alternate</mat-icon>
              {{ 'health.document.addPages' | transloco }}
            </button>
            <input
              #pages
              type="file"
              hidden
              multiple
              [accept]="imageTypes"
              (change)="choose($any($event.target).files)"
            />
            @if (files().length) {
              <span>{{
                'health.document.newPages' | transloco: {count: files().length}
              }}</span>
            } @else {
              <span class="hint">
                {{
                  'health.document.pages'
                    | transloco: {count: data.document.pages}
                }}
              </span>
            }
          </div>
        }
        @if (problem(); as key) {
          <p class="error" role="alert">{{ key | transloco }}</p>
        }
        <mat-form-field>
          <mat-label>{{ 'health.document.name' | transloco }}</mat-label>
          <input matInput maxlength="200" formControlName="name" required />
        </mat-form-field>
        <div class="row">
          <mat-form-field>
            <mat-label>{{ 'health.document.kind' | transloco }}</mat-label>
            <mat-select formControlName="kind">
              @for (kind of kinds; track kind) {
                <mat-option [value]="kind">{{
                  'health.documentKinds.' + kind | transloco
                }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'health.document.date' | transloco }}</mat-label>
            <input matInput type="date" formControlName="documentedOn" />
          </mat-form-field>
        </div>
        <mat-form-field>
          <mat-label>{{ 'health.visit.one' | transloco }}</mat-label>
          <mat-select formControlName="visitId">
            <mat-option [value]="''">—</mat-option>
            @for (visit of data.record.visits; track visit.id) {
              <mat-option [value]="visit.id">{{ visit.visitedOn }}</mat-option>
            }
          </mat-select>
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
          [disabled]="
            form.invalid ||
            busy() ||
            problem() ||
            (!data.document && !files().length)
          "
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
      min-width: min(480px, 80vw);
    }
    .file {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
      overflow-wrap: anywhere;
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }
    .row > * {
      flex: 1 1 180px;
    }
    .hint {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .error {
      color: var(--mat-sys-error);
    }
  `,
})
export class DocumentDialog {
  protected readonly data = inject<DocumentDialogData>(MAT_DIALOG_DATA);
  private readonly api = inject(HealthApi);
  private readonly ref = inject(MatDialogRef<DocumentDialog, boolean>);

  protected readonly kinds = HEALTH_DOCUMENT_KINDS;
  protected readonly types = HEALTH_DOCUMENT_TYPES.join(',');
  protected readonly imageTypes =
    HEALTH_DOCUMENT_TYPES.filter(isHealthPageType).join(',');
  protected readonly size = fileSize;
  /** One file, or the photos of the pages in order; for a document kept — pages to add. */
  protected readonly files = signal<File[]>([]);
  /** What is wrong with the files chosen (a translation key); `null` — nothing. */
  protected readonly problem = computed(() =>
    filesProblem(this.files(), this.data.document),
  );
  protected readonly busy = signal(false);
  protected readonly error = signal(false);

  private readonly document = this.data.document;
  /** A photographed document takes more pages; a PDF has its own. */
  protected readonly takesPages = Boolean(
    this.document && isHealthPageType(this.document.mimeType),
  );
  protected readonly form = inject(NonNullableFormBuilder).group({
    name: [this.document?.name ?? '', Validators.required],
    kind: (this.document?.kind ?? 'consultation') as HealthDocumentKind,
    documentedOn: this.document?.documentedOn ?? this.data.day ?? '',
    visitId: this.document?.visitId ?? this.data.visitId ?? '',
  });

  /** The name of the first file, without its extension, until one is typed. */
  protected choose(list: FileList | null): void {
    const files = Array.from(list ?? []);
    this.files.set(files);
    if (files.length && !this.form.controls.name.value.trim()) {
      this.form.controls.name.setValue(
        files[0].name.replace(/\.[^.]+$/, '').slice(0, 200),
      );
    }
  }

  protected async save(): Promise<void> {
    const value = this.form.getRawValue();
    const input = {
      name: value.name.trim(),
      kind: value.kind,
      documentedOn: orNull(value.documentedOn),
      visitId: orNull(value.visitId),
    };
    const [first, ...rest] = this.files();
    this.busy.set(true);
    this.error.set(false);
    try {
      // The first file makes the document, the others follow it as its pages.
      const id = this.document
        ? (await this.api.client.updateDocument(this.document.id, input)).id
        : (await this.api.client.uploadDocument(input, first)).id;
      for (const page of this.document ? this.files() : rest) {
        await this.api.client.addDocumentPage(id, page);
      }
      this.ref.close(true);
    } catch {
      this.error.set(true);
    } finally {
      this.busy.set(false);
    }
  }
}

/**
 * Why the files cannot go as they are: a PDF goes alone (it has pages of its own), pages are
 * photos, and there are not more than a document holds. `existing` — pages are added to it.
 */
function filesProblem(
  files: File[],
  existing: HealthDocument | undefined,
): string | null {
  if (files.some(file => file.size > HEALTH_DOCUMENT_MAX_BYTES)) {
    return 'health.document.tooBig';
  }
  const photos = files.every(file => isHealthPageType(file.type));
  if (!photos && (files.length > 1 || existing)) {
    return 'health.document.onePdf';
  }
  if (files.length + (existing?.pages ?? 0) > HEALTH_DOCUMENT_MAX_PAGES) {
    return 'health.document.tooManyPages';
  }
  return null;
}
