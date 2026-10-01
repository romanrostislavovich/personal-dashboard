import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Reminder, ReminderStatus } from '@pd/contracts';
import { firstValueFrom } from 'rxjs';
import { TasksApi } from '../tasks.api';
import { ReminderDialogData, ReminderFormDialog } from './reminder-form.dialog';

interface Group {
  status: ReminderStatus;
  items: Reminder[];
}

/** The order of the groups: what needs an answer first, then what waits, then the answered. */
const GROUPS: ReminderStatus[] = ['fired', 'scheduled', 'done'];

/**
 * Reminders: the ones that went off and wait for an answer ("done" or another time), the ones
 * still waiting, and the ones answered lately. Times are shown on the device's own clock.
 */
@Component({
  selector: 'pd-reminders-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, MatButtonModule, MatIconModule, MatTooltipModule, TranslocoPipe],
  template: `
    <div class="toolbar">
      <button matButton="filled" (click)="open({ mode: 'new' })">
        <mat-icon>add_alert</mat-icon> {{ 'tasks.reminders.dialog.new' | transloco }}
      </button>
    </div>

    @for (group of groups(); track group.status) {
      <section>
        <h3>
          {{ 'tasks.reminders.groups.' + group.status | transloco }} · {{ group.items.length }}
        </h3>
        <ul>
          @for (reminder of group.items; track reminder.id) {
            <li [class]="reminder.status">
              <span class="when">{{ reminder.remindAt | date: 'd MMM, HH:mm' }}</span>
              <span class="text">
                {{ reminder.text }}
                @if (reminder.repeat; as repeat) {
                  <span class="repeat">
                    <mat-icon inline>repeat</mat-icon>
                    {{ 'tasks.repeat.every' | transloco }} {{ repeat.every }}
                    {{ 'tasks.repeat.short.' + repeat.unit | transloco }}
                  </span>
                }
                @if (reminder.taskId) {
                  <span class="repeat">
                    <mat-icon inline>task_alt</mat-icon>
                    {{ 'tasks.reminders.aboutTask' | transloco }}
                  </span>
                }
              </span>
              @if (reminder.status === 'fired') {
                <button matButton (click)="done(reminder)">
                  <mat-icon>check</mat-icon> {{ 'tasks.reminders.done' | transloco }}
                </button>
                <button matButton (click)="open({ mode: 'snooze', reminder })">
                  <mat-icon>snooze</mat-icon> {{ 'tasks.reminders.snooze' | transloco }}
                </button>
              } @else if (reminder.status === 'scheduled') {
                <button
                  matIconButton
                  [matTooltip]="'core.actions.edit' | transloco"
                  [attr.aria-label]="'core.actions.edit' | transloco"
                  (click)="open({ mode: 'edit', reminder })"
                >
                  <mat-icon>edit</mat-icon>
                </button>
              }
              <button
                matIconButton
                [matTooltip]="'core.actions.delete' | transloco"
                [attr.aria-label]="'core.actions.delete' | transloco"
                (click)="remove(reminder)"
              >
                <mat-icon>delete</mat-icon>
              </button>
            </li>
          }
        </ul>
      </section>
    } @empty {
      @if (!reminders.isLoading()) {
        <p class="empty">{{ 'tasks.reminders.empty' | transloco }}</p>
      }
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .toolbar {
      display: flex;
      justify-content: flex-end;
    }
    h3 {
      margin: 0 0 8px;
      font: var(--mat-sys-title-small);
      color: var(--mat-sys-on-surface-variant);
    }
    ul {
      margin: 0;
      padding: 0;
      list-style: none;
      border: 1px solid var(--pd-border);
      border-radius: var(--pd-radius);
      background: var(--pd-card);
    }
    li {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px 12px;
      padding: 6px 8px 6px 12px;
      border-top: 1px solid var(--mat-sys-outline-variant);
      border-left: 3px solid transparent;
    }
    li:first-child {
      border-top: 0;
    }
    /* Went off and waits for an answer. */
    li.fired {
      border-left-color: var(--mat-sys-primary);
    }
    li.done .text {
      text-decoration: line-through;
      color: var(--mat-sys-on-surface-variant);
    }
    .when {
      flex: 0 0 110px;
      font-variant-numeric: tabular-nums;
      color: var(--mat-sys-on-surface-variant);
    }
    .text {
      flex: 1 1 200px;
      overflow-wrap: anywhere;
    }
    .repeat {
      margin-left: 8px;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
      white-space: nowrap;
    }
    .empty {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class RemindersPage {
  private readonly api = inject(TasksApi);
  private readonly dialog = inject(MatDialog);
  private readonly transloco = inject(TranslocoService);

  protected readonly reminders = this.api.reminders();

  protected readonly groups = computed<Group[]>(() =>
    GROUPS.map((status) => ({
      status,
      items: this.reminders
        .value()
        .filter((reminder) => reminder.status === status)
        // Answered ones: the latest first; the others come nearest first from the server.
        .sort((a, b) => (status === 'done' ? b.remindAt.localeCompare(a.remindAt) : 0)),
    })).filter((group) => group.items.length > 0),
  );

  protected async open(data: ReminderDialogData): Promise<void> {
    if (await firstValueFrom(this.dialog.open(ReminderFormDialog, { data }).afterClosed())) {
      this.reminders.reload();
    }
  }

  protected async done(reminder: Reminder): Promise<void> {
    await firstValueFrom(this.api.reminderDone(reminder.id));
    this.reminders.reload();
  }

  protected async remove(reminder: Reminder): Promise<void> {
    const key = reminder.repeat
      ? 'tasks.reminders.confirmDeleteSeries'
      : 'tasks.reminders.confirmDelete';
    if (confirm(this.transloco.translate(key, { text: reminder.text }))) {
      await firstValueFrom(this.api.removeReminder(reminder.id));
      this.reminders.reload();
    }
  }
}
