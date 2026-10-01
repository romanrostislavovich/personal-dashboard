import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Task } from '@pd/contracts';
import { firstValueFrom } from 'rxjs';
import { todayLocal } from '../local-time';
import { ReminderDialogData, ReminderFormDialog } from '../reminders/reminder-form.dialog';
import { TasksApi } from '../tasks.api';
import { TaskDialogData, TaskFormDialog } from './task-form.dialog';
import { allTags, filterTasks, isOverdue, TASK_VIEWS, TaskFilter, TaskView } from './task-filter';

/**
 * The TODO list: quick adding, views (today with the overdue, upcoming, all, done), the user's
 * own lists and tags as filters. A click on a task opens it; the bell sets a reminder about it.
 */
@Component({
  selector: 'pd-todo-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    MatButtonModule,
    MatButtonToggleModule,
    MatCheckboxModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatTooltipModule,
    TranslocoPipe,
  ],
  templateUrl: './todo.page.html',
  styleUrl: './todo.page.scss',
})
export class TodoPage {
  private readonly api = inject(TasksApi);
  private readonly dialog = inject(MatDialog);
  private readonly transloco = inject(TranslocoService);

  protected readonly tasks = this.api.tasks();
  protected readonly lists = this.api.lists();
  protected readonly views = TASK_VIEWS;
  protected readonly today = todayLocal();

  protected readonly filter = signal<TaskFilter>({ view: 'today', listId: null, tag: null });
  protected readonly shown = computed(() =>
    filterTasks(this.tasks.value(), this.filter(), this.today),
  );
  protected readonly tags = computed(() => allTags(this.tasks.value()));
  /** How many tasks each view holds — next to its name. */
  protected readonly counts = computed(() => {
    const tasks = this.tasks.value();
    const count = (view: TaskView) =>
      filterTasks(tasks, { view, listId: null, tag: null }, this.today).length;
    return { today: count('today'), upcoming: count('upcoming'), all: count('all') };
  });
  protected readonly listNames = computed(
    () => new Map(this.lists.value().map((list) => [list.id, list.name])),
  );

  protected setFilter(change: Partial<TaskFilter>): void {
    this.filter.update((filter) => ({ ...filter, ...change }));
  }

  protected overdue(task: Task): boolean {
    return isOverdue(task, this.today);
  }

  protected checklistDone(task: Task): number {
    return task.checklist.filter((item) => item.done).length;
  }

  /** A task typed in the quick field lands in the list and on the day of the current view. */
  protected async quickAdd(input: HTMLInputElement): Promise<void> {
    const title = input.value.trim();
    if (!title) {
      return;
    }
    input.value = '';
    const { view, listId } = this.filter();
    await firstValueFrom(
      this.api.create({
        title,
        listId: listId === 'inbox' ? null : listId,
        dueDate: view === 'today' ? this.today : null,
      }),
    );
    this.reload();
  }

  protected async toggle(task: Task, done: boolean): Promise<void> {
    await firstValueFrom(done ? this.api.complete(task.id) : this.api.reopen(task.id));
    this.reload();
  }

  protected async open(task: Task | null): Promise<void> {
    const { view, listId } = this.filter();
    const data: TaskDialogData = {
      task,
      lists: this.lists.value(),
      defaults: {
        listId: listId === 'inbox' ? null : listId,
        dueDate: view === 'today' ? this.today : null,
      },
    };
    if (await firstValueFrom(this.dialog.open(TaskFormDialog, { data }).afterClosed())) {
      this.reload();
    }
  }

  /** "Remind me about this task": a reminder tied to it. */
  protected async remind(task: Task): Promise<void> {
    const data: ReminderDialogData = { mode: 'new', text: task.title, taskId: task.id };
    if (await firstValueFrom(this.dialog.open(ReminderFormDialog, { data }).afterClosed())) {
      this.reload();
    }
  }

  protected async remove(task: Task): Promise<void> {
    if (confirm(this.transloco.translate('tasks.todo.confirmDelete', { title: task.title }))) {
      await firstValueFrom(this.api.remove(task.id));
      this.reload();
    }
  }

  protected async addList(input: HTMLInputElement): Promise<void> {
    const name = input.value.trim();
    if (!name) {
      return;
    }
    input.value = '';
    await firstValueFrom(this.api.createList(name)).catch(() => undefined);
    this.lists.reload();
  }

  /** The tasks of a deleted list go back to the inbox. */
  protected async removeList(id: string, name: string): Promise<void> {
    if (confirm(this.transloco.translate('tasks.todo.confirmDeleteList', { name }))) {
      await firstValueFrom(this.api.removeList(id));
      this.setFilter({ listId: null });
      this.reload();
    }
  }

  private reload(): void {
    this.tasks.reload();
    this.lists.reload();
  }
}
