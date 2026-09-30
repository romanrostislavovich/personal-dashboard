import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

/**
 * Deleting the whole diary cannot be undone, so the word from the dialog must be typed first.
 * Closes with `true` when confirmed.
 */
@Component({
  selector: 'pd-diary-delete-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatDialogModule, MatFormFieldModule, MatInputModule, TranslocoPipe],
  template: `
    <h2 mat-dialog-title>{{ 'diary.deleteAll.title' | transloco }}</h2>
    <mat-dialog-content class="content">
      <p>{{ 'diary.deleteAll.warning' | transloco }}</p>
      <p>{{ 'diary.deleteAll.typeWord' | transloco: { word: word } }}</p>
      <mat-form-field subscriptSizing="dynamic">
        <input
          matInput
          [value]="typed()"
          (input)="typed.set($any($event.target).value)"
          [placeholder]="word"
          autocomplete="off"
        />
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>{{ 'core.actions.cancel' | transloco }}</button>
      <button matButton="filled" class="danger" [disabled]="!confirmed()" [mat-dialog-close]="true">
        {{ 'diary.deleteAll.confirm' | transloco }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .content {
      max-width: 440px;
    }
    .danger:not(:disabled) {
      background: var(--mat-sys-error);
      color: var(--mat-sys-on-error);
    }
  `,
})
export class DiaryDeleteDialog {
  protected readonly word = inject(TranslocoService).translate('diary.deleteAll.word');
  protected readonly typed = signal('');
  protected readonly confirmed = computed(
    () => this.typed().trim().toLowerCase() === this.word.toLowerCase(),
  );
}
