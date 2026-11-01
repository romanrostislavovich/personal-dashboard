import {ChangeDetectionStrategy, Component, inject} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MAT_DIALOG_DATA, MatDialogModule} from '@angular/material/dialog';
import {TranslocoPipe} from '@jsverse/transloco';
import {Task, TaskDeleteSteps} from '@pd/contracts';

/**
 * Deleting a task that has steps: with them, or only the task — the steps stay as tasks of their
 * own. Closes with the choice, or nothing when cancelled. Both go to the trash.
 */
@Component({
  selector: 'pd-task-delete-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatDialogModule, TranslocoPipe],
  template: `
    <h2 mat-dialog-title>
      {{ 'tasks.steps.deleteTitle' | transloco: {title: task.title} }}
    </h2>
    <mat-dialog-content>
      {{ 'tasks.steps.deleteText' | transloco: {count: task.steps?.total} }}
    </mat-dialog-content>
    <mat-dialog-actions align="end" class="actions">
      <button matButton mat-dialog-close>
        {{ 'core.actions.cancel' | transloco }}
      </button>
      <button matButton="outlined" [mat-dialog-close]="keep">
        {{ 'tasks.steps.deleteKeep' | transloco }}
      </button>
      <button matButton="filled" class="danger" [mat-dialog-close]="all">
        {{ 'tasks.steps.deleteAll' | transloco: {count: task.steps?.total} }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .actions {
      flex-wrap: wrap;
      gap: 8px;
    }
    .danger {
      --mat-button-filled-container-color: var(--mat-sys-error);
      --mat-button-filled-label-text-color: var(--mat-sys-on-error);
    }
  `,
})
export class TaskDeleteDialog {
  protected readonly task = inject<Task>(MAT_DIALOG_DATA);
  protected readonly keep: TaskDeleteSteps = 'keep';
  protected readonly all: TaskDeleteSteps = 'delete';
}
