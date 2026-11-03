import {
  ChangeDetectionStrategy,
  Component,
  inject,
  Injectable,
  signal,
} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {TranslocoPipe} from '@jsverse/transloco';
import {firstValueFrom} from 'rxjs';

export interface PromptOptions {
  /** The question, already in the user's language. */
  label: string;
  value?: string;
  maxLength?: number;
  /** `decimal` — a number keyboard on a phone. */
  inputMode?: 'text' | 'decimal';
}

@Component({
  selector: 'pd-prompt-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    TranslocoPipe,
  ],
  template: `
    <mat-dialog-content class="form">
      <mat-form-field>
        <mat-label>{{ data.label }}</mat-label>
        <input
          matInput
          cdkFocusInitial
          [attr.maxlength]="data.maxLength ?? null"
          [attr.inputmode]="data.inputMode ?? 'text'"
          [(ngModel)]="value"
          (keydown.enter)="done()"
        />
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>
        {{ 'core.actions.cancel' | transloco }}
      </button>
      <button matButton="filled" (click)="done()">
        {{ 'core.actions.ok' | transloco }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .form {
      padding-top: 16px;
      min-width: min(360px, 84vw);
    }
  `,
})
class PromptDialog {
  protected readonly data = inject<PromptOptions>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<PromptDialog, string>);
  protected readonly value = signal(this.data.value ?? '');

  protected done(): void {
    this.dialogRef.close(this.value());
  }
}

/**
 * `window.prompt()` as a dialog of the dashboard: the desktop app (Electron) has no `prompt()`
 * — it gives nothing back there, so what asked for a name silently did nothing.
 */
@Injectable({providedIn: 'root'})
export class PromptService {
  private readonly dialog = inject(MatDialog);

  /** The text typed, or `null` when the dialog was cancelled — like `prompt()`. */
  async ask(options: PromptOptions): Promise<string | null> {
    const answer = await firstValueFrom(
      this.dialog
        .open<PromptDialog, PromptOptions, string>(PromptDialog, {
          data: options,
        })
        .afterClosed(),
    );
    return answer ?? null;
  }
}
