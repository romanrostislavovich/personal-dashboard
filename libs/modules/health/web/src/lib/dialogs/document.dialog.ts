import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  HEALTH_DOCUMENT_KINDS,
  HEALTH_DOCUMENT_MAX_BYTES,
  HEALTH_DOCUMENT_TYPES,
  HealthDocument,
  HealthDocumentKind,
  HealthRecord,
} from '@pd/contracts';
import { HealthApi } from '../health.api';
import { fileSize, orNull } from '../health-labels';

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
      {{ (data.document ? 'health.document.edit' : 'health.document.add') | transloco }}
    </h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content class="form">
        @if (!data.document) {
          <div class="file">
            <button matButton="tonal" type="button" (click)="input.click()">
              <mat-icon>upload_file</mat-icon> {{ 'health.document.choose' | transloco }}
            </button>
            <input
              #input
              type="file"
              hidden
              [accept]="types"
              (change)="choose($any($event.target).files?.[0])"
            />
            @if (file(); as chosen) {
              <span>{{ chosen.name }} · {{ size(chosen.size) }}</span>
            } @else {
              <span class="hint">{{ 'health.document.types' | transloco }}</span>
            }
          </div>
          @if (tooBig()) {
            <p class="error" role="alert">{{ 'health.document.tooBig' | transloco }}</p>
          }
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
          <p class="error" role="alert">{{ 'health.errors.save' | transloco }}</p>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton type="button" mat-dialog-close>
          {{ 'core.actions.cancel' | transloco }}
        </button>
        <button
          matButton="filled"
          type="submit"
          [disabled]="form.invalid || busy() || (!data.document && (!file() || tooBig()))"
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
  protected readonly size = fileSize;
  protected readonly file = signal<File | null>(null);
  protected readonly tooBig = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal(false);

  private readonly document = this.data.document;
  protected readonly form = inject(NonNullableFormBuilder).group({
    name: [this.document?.name ?? '', Validators.required],
    kind: (this.document?.kind ?? 'consultation') as HealthDocumentKind,
    documentedOn: this.document?.documentedOn ?? this.data.day ?? '',
    visitId: this.document?.visitId ?? this.data.visitId ?? '',
  });

  /** The name of the file, without its extension, until one is typed. */
  protected choose(file: File | undefined): void {
    this.file.set(file ?? null);
    this.tooBig.set(Boolean(file && file.size > HEALTH_DOCUMENT_MAX_BYTES));
    if (file && !this.form.controls.name.value.trim()) {
      this.form.controls.name.setValue(file.name.replace(/\.[^.]+$/, '').slice(0, 200));
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
    const file = this.file();
    this.busy.set(true);
    this.error.set(false);
    try {
      if (this.document) {
        await this.api.client.updateDocument(this.document.id, input);
      } else if (file) {
        await this.api.client.uploadDocument(input, file);
      }
      this.ref.close(true);
    } catch {
      this.error.set(true);
    } finally {
      this.busy.set(false);
    }
  }
}
