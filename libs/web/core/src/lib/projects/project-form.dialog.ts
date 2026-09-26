import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { TranslocoPipe } from '@jsverse/transloco';
import { Project, ProjectInput } from '@pd/contracts';

/** Диалог создания/редактирования. Возвращает `ProjectInput` или `undefined` при отмене. */
@Component({
  selector: 'pd-project-form-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    TranslocoPipe,
  ],
  template: `
    <h2 mat-dialog-title>
      {{ (project ? 'core.projects.edit' : 'core.projects.add') | transloco }}
    </h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content class="form">
        <mat-form-field>
          <mat-label>{{ 'core.projects.name' | transloco }}</mat-label>
          <input matInput formControlName="name" cdkFocusInitial />
        </mat-form-field>
        <mat-form-field>
          <mat-label>{{ 'core.projects.url' | transloco }}</mat-label>
          <input matInput type="url" formControlName="url" placeholder="https://" />
        </mat-form-field>
        <mat-form-field>
          <mat-label>{{ 'core.projects.description' | transloco }}</mat-label>
          <textarea matInput formControlName="description" rows="3"></textarea>
        </mat-form-field>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton type="button" mat-dialog-close>
          {{ 'core.actions.cancel' | transloco }}
        </button>
        <button matButton="filled" type="submit" [disabled]="form.invalid">
          {{ 'core.actions.save' | transloco }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .form {
      display: flex;
      flex-direction: column;
      min-width: min(420px, 80vw);
    }
  `,
})
export class ProjectFormDialog {
  protected readonly project = inject<Project | null>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<ProjectFormDialog, ProjectInput>);

  protected readonly form = inject(NonNullableFormBuilder).group({
    name: [this.project?.name ?? '', Validators.required],
    url: [this.project?.url ?? ''],
    description: [this.project?.description ?? ''],
  });

  save(): void {
    const { name, url, description } = this.form.getRawValue();
    this.dialogRef.close({ name, url: url || null, description: description || null });
  }
}
