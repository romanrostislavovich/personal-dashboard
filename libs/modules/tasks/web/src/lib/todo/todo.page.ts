import {DatePipe} from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatButtonToggleModule} from '@angular/material/button-toggle';
import {MatCheckboxModule} from '@angular/material/checkbox';
import {MatChipsModule} from '@angular/material/chips';
import {MatDialog} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatTooltipModule} from '@angular/material/tooltip';
import {AuthService, DurationPipe} from '@pd/web-core';
import {TranslocoPipe, TranslocoService} from '@jsverse/transloco';
import {Task, TASK_HORIZONS} from '@pd/contracts';
import {firstValueFrom} from 'rxjs';
import {todayLocal} from '../local-time';
import {
  ReminderDialogData,
  ReminderFormDialog,
} from '../reminders/reminder-form.dialog';
import {TasksApi} from '../tasks.api';
import {TaskDeleteDialog} from './task-delete.dialog';
import {TaskDialogData, TaskFormDialog} from './task-form.dialog';
import {WindowHintComponent} from './window-hint.component';
import {TaskGroupData, TaskGroupDialog} from './task-group.dialog';
import {parentChoices, taskRows} from './task-rows';
import {
  allTags,
  filterTasks,
  isOverdue,
  TASK_VIEWS,
  TaskFilter,
  TaskView,
} from './task-filter';

/**
 * The TODO list: quick adding, views (today with the overdue, upcoming, all, done), the user's
 * own lists and tags as filters. A click on a task opens it; the bell sets a reminder about it.
 * A task can have steps (one level): they sit under it and fold away; tasks are put into one by
 * "Add a step", by choosing several and grouping them, or by dragging one onto another.
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
    DurationPipe,
    WindowHintComponent,
  ],
  templateUrl: './todo.page.html',
  styleUrl: './todo.page.scss',
})
export class TodoPage {
  private readonly api = inject(TasksApi);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly transloco = inject(TranslocoService);

  protected readonly tasks = this.api.tasks();
  protected readonly lists = this.api.lists();
  protected readonly views = TASK_VIEWS;
  protected readonly today = todayLocal();

  /** The page opens on everything that is not done: the whole list, not only today's part. */
  protected readonly filter = signal<TaskFilter>({
    view: 'all',
    listId: null,
    tag: null,
    horizon: null,
  });
  protected readonly horizons = TASK_HORIZONS;
  protected readonly shown = computed(() =>
    filterTasks(this.tasks.value(), this.filter(), this.today),
  );
  /** Tasks whose steps are folded away. */
  protected readonly collapsed = signal<ReadonlySet<string>>(new Set());
  protected readonly rows = computed(() =>
    taskRows(this.shown(), this.tasks.value(), this.collapsed()),
  );
  /** Choosing tasks to group; `null` — the usual list. */
  protected readonly selected = signal<ReadonlySet<string> | null>(null);
  /** The task being dragged onto another. */
  private readonly dragged = signal<Task | null>(null);
  protected readonly dropTarget = signal<string | null>(null);
  protected readonly tags = computed(() => allTags(this.tasks.value()));
  /** How many tasks each view holds — next to its name. */
  protected readonly counts = computed(() => {
    const tasks = this.tasks.value();
    const count = (view: TaskView) =>
      filterTasks(tasks, {view, listId: null, tag: null}, this.today).length;
    return {
      today: count('today'),
      upcoming: count('upcoming'),
      all: count('all'),
    };
  });
  protected readonly listNames = computed(
    () => new Map(this.lists.value().map(list => [list.id, list.name])),
  );

  protected setFilter(change: Partial<TaskFilter>): void {
    this.filter.update(filter => ({...filter, ...change}));
  }

  /** Past its date, shown in red — unless the user asked for soft overdue (CalmSettings). */
  protected overdue(task: Task): boolean {
    return !this.auth.user()?.calm.softOverdue && isOverdue(task, this.today);
  }

  protected toggleCollapsed(id: string): void {
    this.collapsed.update(ids => toggled(ids, id));
  }

  protected startSelecting(): void {
    this.selected.set(new Set());
  }

  protected stopSelecting(): void {
    this.selected.set(null);
  }

  protected toggleSelected(id: string): void {
    this.selected.update(ids => ids && toggled(ids, id));
  }

  /** The chosen tasks become steps of a new task or of an existing one. */
  protected async group(): Promise<void> {
    const taskIds = [...(this.selected() ?? [])];
    if (!taskIds.length) {
      return;
    }
    const data: TaskGroupData = {
      taskIds,
      choices: parentChoices(this.tasks.value(), null).filter(
        task => !taskIds.includes(task.id),
      ),
    };
    if (
      await firstValueFrom(
        this.dialog.open(TaskGroupDialog, {data}).afterClosed(),
      )
    ) {
      this.stopSelecting();
      this.reload();
    }
  }

  /** "Add a step" of a task: a new task inside it. */
  protected addStep(task: Task): Promise<void> {
    return this.openForm(null, {parentId: task.id});
  }

  protected dragStart(event: DragEvent, task: Task): void {
    this.dragged.set(task);
    event.dataTransfer?.setData('text/plain', task.title);
  }

  protected dragEnd(): void {
    this.dragged.set(null);
    this.dropTarget.set(null);
  }

  /** A task may go into another (or next to a step, into its task) — one level only. */
  protected dragOver(event: DragEvent, target: Task): void {
    const task = this.dragged();
    const parentId = target.parentId ?? target.id;
    if (
      task &&
      !task.steps &&
      task.id !== parentId &&
      task.parentId !== parentId
    ) {
      event.preventDefault();
      this.dropTarget.set(target.id);
    }
  }

  protected async drop(event: DragEvent, target: Task): Promise<void> {
    event.preventDefault();
    const task = this.dragged();
    this.dragEnd();
    if (task) {
      await firstValueFrom(
        this.api.update(task.id, {parentId: target.parentId ?? target.id}),
      );
      this.reload();
    }
  }

  protected checklistDone(task: Task): number {
    return task.checklist.filter(item => item.done).length;
  }

  /** A task typed in the quick field lands in the list and on the day of the current view. */
  protected async quickAdd(input: HTMLInputElement): Promise<void> {
    const title = input.value.trim();
    if (!title) {
      return;
    }
    input.value = '';
    const {view, listId} = this.filter();
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
    await firstValueFrom(
      done ? this.api.complete(task.id) : this.api.reopen(task.id),
    );
    this.reload();
  }

  protected open(task: Task | null): Promise<void> {
    return this.openForm(task, {});
  }

  private async openForm(
    task: Task | null,
    defaults: TaskDialogData['defaults'],
  ): Promise<void> {
    const {view, listId} = this.filter();
    const data: TaskDialogData = {
      task,
      lists: this.lists.value(),
      tasks: this.tasks.value(),
      defaults: {
        listId: listId === 'inbox' ? null : listId,
        dueDate: view === 'today' ? this.today : null,
        ...defaults,
      },
    };
    if (
      await firstValueFrom(
        this.dialog.open(TaskFormDialog, {data}).afterClosed(),
      )
    ) {
      this.reload();
    }
  }

  /** "Remind me about this task": a reminder tied to it. */
  protected async remind(task: Task): Promise<void> {
    const data: ReminderDialogData = {
      mode: 'new',
      text: task.title,
      taskId: task.id,
    };
    if (
      await firstValueFrom(
        this.dialog.open(ReminderFormDialog, {data}).afterClosed(),
      )
    ) {
      this.reload();
    }
  }

  /** A task with steps asks whether they go too; both ways it lands in the trash. */
  protected async remove(task: Task): Promise<void> {
    if (task.steps) {
      const steps = await firstValueFrom(
        this.dialog.open(TaskDeleteDialog, {data: task}).afterClosed(),
      );
      if (steps) {
        await firstValueFrom(this.api.remove(task.id, steps));
        this.reload();
      }
      return;
    }
    if (
      confirm(
        this.transloco.translate('tasks.todo.confirmDelete', {
          title: task.title,
        }),
      )
    ) {
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
    if (
      confirm(this.transloco.translate('tasks.todo.confirmDeleteList', {name}))
    ) {
      await firstValueFrom(this.api.removeList(id));
      this.setFilter({listId: null});
      this.reload();
    }
  }

  private reload(): void {
    this.tasks.reload();
    this.lists.reload();
  }
}

/** The set with the id added, or taken out when it was there. */
function toggled(ids: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(ids);
  if (!next.delete(id)) {
    next.add(id);
  }
  return next;
}
