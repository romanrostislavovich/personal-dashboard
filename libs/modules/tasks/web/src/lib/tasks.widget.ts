import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Task } from '@pd/contracts';
import { firstValueFrom } from 'rxjs';
import { todayLocal } from './local-time';
import { TasksApi } from './tasks.api';
import { filterTasks, isOverdue } from './todo/task-filter';

const WIDGET_MAX_TASKS = 6;

/** Home widget: today's tasks (with the overdue ones) to tick off, and the next reminder. */
@Component({
  selector: 'pd-tasks-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, MatButtonModule, MatCardModule, MatCheckboxModule, TranslocoPipe],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-card-title>✅ {{ 'tasks.widget.title' | transloco }}</mat-card-title>
        @if (today().length > shown().length) {
          <mat-card-subtitle>
            {{ 'tasks.widget.more' | transloco: { count: today().length - shown().length } }}
          </mat-card-subtitle>
        }
      </mat-card-header>
      <mat-card-content class="content">
        @for (task of shown(); track task.id) {
          <mat-checkbox (change)="complete(task)">
            <span [class.overdue]="overdue(task)">{{ task.title }}</span>
          </mat-checkbox>
        } @empty {
          <p class="muted">{{ 'tasks.widget.empty' | transloco }}</p>
        }
        @if (nextReminder(); as reminder) {
          <p class="muted reminder">
            ⏰ {{ reminder.remindAt | date: 'd MMM, HH:mm' }} — {{ reminder.text }}
          </p>
        }
      </mat-card-content>
      <mat-card-actions align="end">
        <a matButton routerLink="/tasks">{{ 'tasks.widget.open' | transloco }}</a>
      </mat-card-actions>
    </mat-card>
  `,
  styles: `
    .content {
      display: flex;
      flex-direction: column;
      padding-top: 8px;
    }
    .overdue {
      color: var(--mat-sys-error);
    }
    .muted {
      margin: 8px 0 0;
      color: var(--mat-sys-on-surface-variant);
    }
    .reminder {
      font: var(--mat-sys-body-small);
    }
  `,
})
export class TasksWidget {
  private readonly api = inject(TasksApi);
  private readonly tasks = this.api.tasks();
  private readonly reminders = this.api.reminders();
  private readonly day = todayLocal();

  /** Due today or earlier, in the order the server gives: by date, then by priority. */
  protected readonly today = computed(() =>
    filterTasks(this.tasks.value(), { view: 'today', listId: null, tag: null }, this.day),
  );
  protected readonly shown = computed(() => this.today().slice(0, WIDGET_MAX_TASKS));
  protected readonly nextReminder = computed(
    () => this.reminders.value().find((reminder) => reminder.status === 'scheduled') ?? null,
  );

  protected overdue(task: Task): boolean {
    return isOverdue(task, this.day);
  }

  protected async complete(task: Task): Promise<void> {
    await firstValueFrom(this.api.complete(task.id));
    this.tasks.reload();
  }
}
