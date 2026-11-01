import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatButtonToggleModule} from '@angular/material/button-toggle';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {TranslocoPipe} from '@jsverse/transloco';
import {Task} from '@pd/contracts';
import {firstValueFrom} from 'rxjs';
import {TasksApi} from '../tasks.api';

export interface TaskGroupData {
  /** The tasks to become steps. */
  taskIds: string[];
  /** Tasks they can go into (open, not steps, not among them). */
  choices: Task[];
}

/**
 * "Group": the chosen tasks become steps of a new task (its title typed here) or of an existing
 * one. Saves by itself and closes with `true`.
 */
@Component({
  selector: 'pd-task-group-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    TranslocoPipe,
  ],
  template: `
    <h2 mat-dialog-title>
      {{ 'tasks.steps.groupTitle' | transloco: {count: data.taskIds.length} }}
    </h2>
    <mat-dialog-content class="form">
      @if (data.choices.length) {
        <mat-button-toggle-group
          hideSingleSelectionIndicator
          [attr.aria-label]="'tasks.steps.groupInto' | transloco"
          [(ngModel)]="into"
        >
          <mat-button-toggle value="new">{{
            'tasks.steps.intoNew' | transloco
          }}</mat-button-toggle>
          <mat-button-toggle value="existing">{{
            'tasks.steps.intoExisting' | transloco
          }}</mat-button-toggle>
        </mat-button-toggle-group>
      }
      @if (into() === 'new') {
        <mat-form-field>
          <mat-label>{{ 'tasks.steps.newParent' | transloco }}</mat-label>
          <input
            matInput
            cdkFocusInitial
            maxlength="300"
            [placeholder]="'tasks.steps.newParentHint' | transloco"
            [(ngModel)]="title"
            (keydown.enter)="save()"
          />
        </mat-form-field>
      } @else {
        <mat-form-field>
          <mat-label>{{ 'tasks.steps.parent' | transloco }}</mat-label>
          <mat-select [(ngModel)]="parentId">
            @for (choice of data.choices; track choice.id) {
              <mat-option [value]="choice.id">{{ choice.title }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>
        {{ 'core.actions.cancel' | transloco }}
      </button>
      <button
        matButton="filled"
        [disabled]="!valid() || saving()"
        (click)="save()"
      >
        {{ 'tasks.steps.group' | transloco }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .form {
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-width: min(420px, 84vw);
    }
  `,
})
export class TaskGroupDialog {
  protected readonly data = inject<TaskGroupData>(MAT_DIALOG_DATA);
  private readonly api = inject(TasksApi);
  private readonly dialogRef = inject(MatDialogRef<TaskGroupDialog, boolean>);

  protected readonly into = signal<'new' | 'existing'>('new');
  protected readonly title = signal('');
  protected readonly parentId = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly valid = computed(() =>
    this.into() === 'new' ? Boolean(this.title().trim()) : !!this.parentId(),
  );

  protected async save(): Promise<void> {
    if (!this.valid() || this.saving()) {
      return;
    }
    this.saving.set(true);
    try {
      await firstValueFrom(
        this.api.group(
          this.into() === 'new'
            ? {taskIds: this.data.taskIds, title: this.title().trim()}
            : {
                taskIds: this.data.taskIds,
                parentId: this.parentId() as string,
              },
        ),
      );
      this.dialogRef.close(true);
    } finally {
      this.saving.set(false);
    }
  }
}
