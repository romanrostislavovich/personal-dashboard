import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { TranslocoPipe } from '@jsverse/transloco';

/** Edits the entry template. Returns the new text (empty string — no template) or `undefined`. */
@Component({
  selector: 'pd-diary-template-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatButtonModule, MatDialogModule, TranslocoPipe],
  template: `
    <h2 mat-dialog-title>{{ 'diary.template.title' | transloco }}</h2>
    <mat-dialog-content>
      <p class="hint">{{ 'diary.template.hint' | transloco }}</p>
      <textarea
        class="text"
        [ngModel]="text()"
        (ngModelChange)="text.set($event)"
        [placeholder]="'diary.template.placeholder' | transloco"
        cdkFocusInitial
      ></textarea>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>{{ 'diary.template.cancel' | transloco }}</button>
      <button matButton="filled" (click)="dialog.close(text())">
        {{ 'diary.template.save' | transloco }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .hint {
      margin-top: 0;
      color: var(--mat-sys-on-surface-variant);
      font: 0.85rem / 1.45 var(--pd-font);
    }
    .text {
      box-sizing: border-box;
      width: min(560px, 80vw);
      min-height: 220px;
      padding: 12px;
      border: 1px solid var(--pd-border);
      border-radius: 12px;
      background: var(--mat-sys-surface-container-lowest);
      color: inherit;
      font: 0.95rem / 1.6 var(--pd-font);
      resize: vertical;
    }
  `,
})
export class DiaryTemplateDialog {
  protected readonly dialog = inject<MatDialogRef<DiaryTemplateDialog, string>>(MatDialogRef);
  protected readonly text = signal(inject<string | null>(MAT_DIALOG_DATA) ?? '');
}
