import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { TranslocoPipe } from '@jsverse/transloco';
import { TrackedRepo } from '@pd/contracts';
import { firstValueFrom } from 'rxjs';
import { errorStatus } from '@pd/web-core';
import { OpenSourceApi } from './open-source.api';

/** Errors the server explains: not on GitHub, or already tracked under the new name. */
const ERROR_KEYS: Record<number, string> = {
  400: 'development.errors.notFound',
  409: 'development.errors.duplicate',
};

/**
 * Editing a tracked repository: its owner/name (a moved repository, a typo) and npm package.
 * Saves by itself and closes with `true` once the repository is synced.
 */
@Component({
  selector: 'pd-repo-form-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    TranslocoPipe,
  ],
  template: `
    <h2 mat-dialog-title>{{ 'development.oss.editTitle' | transloco }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content class="form">
        <mat-form-field>
          <mat-label>{{ 'development.oss.repo' | transloco }}</mat-label>
          <input matInput formControlName="repo" placeholder="owner/name" />
          <mat-hint>{{ 'development.oss.repoChangeHint' | transloco }}</mat-hint>
        </mat-form-field>
        <mat-form-field>
          <mat-label>{{ 'development.oss.npmPackage' | transloco }}</mat-label>
          <input matInput formControlName="npmPackage" />
        </mat-form-field>
        @if (error(); as key) {
          <p class="error">{{ key | transloco }}</p>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton type="button" mat-dialog-close>
          {{ 'core.actions.cancel' | transloco }}
        </button>
        <button matButton="filled" type="submit" [disabled]="form.invalid || saving()">
          {{ 'core.actions.save' | transloco }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .form {
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: min(420px, 80vw);
    }
    .error {
      margin: 0;
      color: var(--mat-sys-error);
    }
  `,
})
export class RepoFormDialog {
  private readonly repo = inject<TrackedRepo>(MAT_DIALOG_DATA);
  private readonly api = inject(OpenSourceApi);
  private readonly dialogRef = inject(MatDialogRef<RepoFormDialog, boolean>);

  protected readonly form = inject(NonNullableFormBuilder).group({
    repo: [this.repo.fullName, Validators.required],
    npmPackage: [this.repo.npmPackage ?? ''],
  });
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async save(): Promise<void> {
    const { repo, npmPackage } = this.form.getRawValue();
    this.saving.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(
        this.api.updateRepo(this.repo.id, { repo, npmPackage: npmPackage.trim() || null }),
      );
      this.dialogRef.close(true);
    } catch (error) {
      const status = errorStatus(error);
      this.error.set(ERROR_KEYS[status] ?? 'development.errors.generic');
    } finally {
      this.saving.set(false);
    }
  }
}
