import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { TranslocoPipe } from '@jsverse/transloco';
import { Reminder, Repeat } from '@pd/contracts';
import { firstValueFrom } from 'rxjs';
import { localInputValue, momentOf, nextHour } from '../local-time';
import { RepeatFieldComponent } from '../repeat-field.component';
import { TasksApi } from '../tasks.api';

/** What the dialog is opened for. */
export type ReminderDialogData =
  /** A new reminder, maybe about a task. */
  | { mode: 'new'; text?: string; taskId?: string }
  /** Another time for a reminder that went off (or is still waiting). */
  | { mode: 'snooze'; reminder: Reminder }
  | { mode: 'edit'; reminder: Reminder };

/**
 * One dialog for a reminder: a new one, an edit, or "remind me later" — the day and the time
 * are picked on the device's own clock. Saves by itself and closes with `true`.
 */
@Component({
  selector: 'pd-reminder-form-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    TranslocoPipe,
    RepeatFieldComponent,
  ],
  template: `
    <h2 mat-dialog-title>{{ 'tasks.reminders.dialog.' + data.mode | transloco }}</h2>
    <mat-dialog-content class="form">
      @if (data.mode !== 'snooze') {
        <mat-form-field>
          <mat-label>{{ 'tasks.reminders.text' | transloco }}</mat-label>
          <input matInput [(ngModel)]="text" cdkFocusInitial maxlength="500" />
        </mat-form-field>
      } @else {
        <p class="about">{{ text() }}</p>
      }
      <mat-form-field>
        <mat-label>{{ 'tasks.reminders.when' | transloco }}</mat-label>
        <input matInput type="datetime-local" [(ngModel)]="when" />
      </mat-form-field>
      @if (data.mode !== 'snooze') {
        <pd-repeat-field [(value)]="repeat" />
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>{{ 'core.actions.cancel' | transloco }}</button>
      <button matButton="filled" [disabled]="!valid() || saving()" (click)="save()">
        {{ 'core.actions.save' | transloco }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .form {
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: min(420px, 80vw);
    }
    .about {
      margin: 0 0 8px;
      font-weight: 600;
    }
  `,
})
export class ReminderFormDialog {
  protected readonly data = inject<ReminderDialogData>(MAT_DIALOG_DATA);
  private readonly api = inject(TasksApi);
  private readonly dialogRef = inject(MatDialogRef<ReminderFormDialog, boolean>);

  private readonly existing = this.data.mode === 'new' ? null : this.data.reminder;
  protected readonly text = signal(
    this.data.mode === 'new' ? (this.data.text ?? '') : this.data.reminder.text,
  );
  /** A snooze starts from the next hour; an edit — from the time it has. */
  protected readonly when = signal(
    this.data.mode === 'edit' ? localInputValue(new Date(this.data.reminder.remindAt)) : nextHour(),
  );
  protected readonly repeat = signal<Repeat | null>(this.existing?.repeat ?? null);
  protected readonly saving = signal(false);

  protected valid(): boolean {
    return Boolean(this.text().trim() && momentOf(this.when()));
  }

  protected async save(): Promise<void> {
    const remindAt = momentOf(this.when());
    if (!remindAt) {
      return;
    }
    this.saving.set(true);
    try {
      const text = this.text().trim();
      switch (this.data.mode) {
        case 'new':
          await firstValueFrom(
            this.api.createReminder({
              text,
              remindAt,
              repeat: this.repeat(),
              taskId: this.data.taskId ?? null,
            }),
          );
          break;
        case 'snooze':
          await firstValueFrom(this.api.snoozeReminder(this.data.reminder.id, remindAt));
          break;
        case 'edit':
          await firstValueFrom(
            this.api.updateReminder(this.data.reminder.id, {
              text,
              remindAt,
              repeat: this.repeat(),
            }),
          );
          break;
      }
      this.dialogRef.close(true);
    } finally {
      this.saving.set(false);
    }
  }
}
