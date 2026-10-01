import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  ChecklistItem,
  Repeat,
  Task,
  TASK_PRIORITIES,
  TaskList,
  TaskPriority,
  TaskUpdate,
} from '@pd/contracts';
import { ProjectsApi } from '@pd/web-core';
import { firstValueFrom } from 'rxjs';
import { RepeatFieldComponent } from '../repeat-field.component';
import { TasksApi } from '../tasks.api';

export interface TaskDialogData {
  /** `null` — a new task. */
  task: Task | null;
  lists: TaskList[];
  /** What a new task starts with: the list and the day of the view it was added from. */
  defaults?: Pick<TaskUpdate, 'listId' | 'dueDate'>;
}

/**
 * A task with everything it has: notes, the due date, priority, list, project, tags, repeat and
 * the checklist. Saves by itself and closes with `true`.
 */
@Component({
  selector: 'pd-task-form-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    TranslocoPipe,
    RepeatFieldComponent,
  ],
  template: `
    <h2 mat-dialog-title>
      {{ (data.task ? 'tasks.todo.editTitle' : 'tasks.todo.newTitle') | transloco }}
    </h2>
    <mat-dialog-content class="form">
      <mat-form-field>
        <mat-label>{{ 'tasks.todo.title' | transloco }}</mat-label>
        <input matInput [(ngModel)]="title" cdkFocusInitial maxlength="300" />
      </mat-form-field>
      <mat-form-field>
        <mat-label>{{ 'tasks.todo.notes' | transloco }}</mat-label>
        <textarea matInput [(ngModel)]="notes" rows="3" maxlength="5000"></textarea>
      </mat-form-field>

      <div class="row">
        <mat-form-field subscriptSizing="dynamic">
          <mat-label>{{ 'tasks.todo.dueDate' | transloco }}</mat-label>
          <input matInput type="date" [(ngModel)]="dueDate" />
        </mat-form-field>
        <mat-form-field subscriptSizing="dynamic">
          <mat-label>{{ 'tasks.todo.priority' | transloco }}</mat-label>
          <mat-select [(ngModel)]="priority">
            @for (p of priorities; track p) {
              <mat-option [value]="p">{{ 'tasks.priority.' + p | transloco }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      </div>

      <pd-repeat-field [(value)]="repeat" />
      @if (repeat() && !dueDate()) {
        <p class="hint">{{ 'tasks.repeat.needsDate' | transloco }}</p>
      }

      <div class="row">
        <mat-form-field subscriptSizing="dynamic">
          <mat-label>{{ 'tasks.todo.list' | transloco }}</mat-label>
          <mat-select [(ngModel)]="listId">
            <mat-option [value]="null">{{ 'tasks.todo.inbox' | transloco }}</mat-option>
            @for (list of data.lists; track list.id) {
              <mat-option [value]="list.id">{{ list.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field subscriptSizing="dynamic">
          <mat-label>{{ 'tasks.todo.project' | transloco }}</mat-label>
          <mat-select [(ngModel)]="projectId">
            <mat-option [value]="null">—</mat-option>
            @for (project of projects.value(); track project.id) {
              <mat-option [value]="project.id">{{ project.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      </div>

      <mat-form-field subscriptSizing="dynamic">
        <mat-label>{{ 'tasks.todo.tags' | transloco }}</mat-label>
        <input matInput [(ngModel)]="tags" [placeholder]="'tasks.todo.tagsHint' | transloco" />
      </mat-form-field>

      <section class="checklist">
        <span class="label">{{ 'tasks.todo.checklist' | transloco }}</span>
        @for (item of checklist(); track $index) {
          <div class="item">
            <mat-checkbox [checked]="item.done" (change)="toggleItem($index, $event.checked)" />
            <span [class.done]="item.done">{{ item.text }}</span>
            <button
              matIconButton
              type="button"
              [attr.aria-label]="'core.actions.delete' | transloco"
              (click)="removeItem($index)"
            >
              <mat-icon>close</mat-icon>
            </button>
          </div>
        }
        <mat-form-field subscriptSizing="dynamic">
          <mat-label>{{ 'tasks.todo.checklistAdd' | transloco }}</mat-label>
          <input matInput #step maxlength="200" (keydown.enter)="addItem(step)" />
        </mat-form-field>
      </section>
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
      min-width: min(520px, 84vw);
    }
    .row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 8px;
    }
    .hint {
      margin: 0;
      color: var(--mat-sys-error);
      font: var(--mat-sys-body-small);
    }
    .checklist {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .label {
      font: var(--mat-sys-label-medium);
      color: var(--mat-sys-on-surface-variant);
    }
    .item {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .item span {
      flex: 1;
    }
    .done {
      text-decoration: line-through;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class TaskFormDialog {
  protected readonly data = inject<TaskDialogData>(MAT_DIALOG_DATA);
  private readonly api = inject(TasksApi);
  private readonly dialogRef = inject(MatDialogRef<TaskFormDialog, boolean>);

  protected readonly projects = inject(ProjectsApi).list();
  protected readonly priorities = TASK_PRIORITIES;

  private readonly task = this.data.task;
  protected readonly title = signal(this.task?.title ?? '');
  protected readonly notes = signal(this.task?.notes ?? '');
  /** `''` — no due date (what an empty date input gives). */
  protected readonly dueDate = signal(this.task?.dueDate ?? this.data.defaults?.dueDate ?? '');
  protected readonly priority = signal<TaskPriority>(this.task?.priority ?? 0);
  protected readonly listId = signal(this.task?.listId ?? this.data.defaults?.listId ?? null);
  protected readonly projectId = signal(this.task?.projectId ?? null);
  /** Tags as the user types them: separated by spaces or commas. */
  protected readonly tags = signal((this.task?.tags ?? []).join(' '));
  protected readonly repeat = signal<Repeat | null>(this.task?.repeat ?? null);
  protected readonly checklist = signal<ChecklistItem[]>(this.task?.checklist ?? []);
  protected readonly saving = signal(false);

  protected valid(): boolean {
    return Boolean(this.title().trim()) && !(this.repeat() && !this.dueDate());
  }

  protected addItem(input: HTMLInputElement): void {
    const text = input.value.trim();
    if (text) {
      this.checklist.update((items) => [...items, { text, done: false }]);
      input.value = '';
    }
  }

  protected toggleItem(index: number, done: boolean): void {
    this.checklist.update((items) =>
      items.map((item, i) => (i === index ? { ...item, done } : item)),
    );
  }

  protected removeItem(index: number): void {
    this.checklist.update((items) => items.filter((_, i) => i !== index));
  }

  protected async save(): Promise<void> {
    const fields = {
      title: this.title().trim(),
      notes: this.notes().trim(),
      dueDate: this.dueDate() || null,
      priority: this.priority(),
      listId: this.listId(),
      projectId: this.projectId(),
      tags: this.tags()
        .split(/[\s,]+/)
        .filter(Boolean),
      repeat: this.repeat(),
      checklist: this.checklist(),
    };
    this.saving.set(true);
    try {
      if (this.task) {
        await firstValueFrom(this.api.update(this.task.id, fields));
      } else {
        await firstValueFrom(this.api.create(fields));
      }
      this.dialogRef.close(true);
    } finally {
      this.saving.set(false);
    }
  }
}
