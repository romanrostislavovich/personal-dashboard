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

/** Errors the server explains: not found, already in the list, a wrong package name. */
const ERROR_KEYS: Record<number, string> = {
  400: 'development.errors.notFound',
  409: 'development.errors.duplicate',
};

/**
 * Two small forms in one dialog: adding a repository the account does not bring by itself
 * (opened without data), and the npm package of a repository already in the list.
 * Saves by itself and closes with `true`.
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
    <h2 mat-dialog-title>
      {{ (repo ? 'development.oss.editNpm' : 'development.oss.addTitle') | transloco }}
    </h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content class="form">
        @if (repo) {
          <p class="hint">{{ repo.fullName }}</p>
        } @else {
          <p class="hint">{{ 'development.oss.addHint' | transloco }}</p>
          <mat-form-field>
            <mat-label>{{ 'development.oss.repo' | transloco }}</mat-label>
            <input matInput formControlName="repo" placeholder="owner/name" />
            <mat-hint>{{ 'development.oss.repoHint' | transloco }}</mat-hint>
          </mat-form-field>
        }
        <mat-form-field>
          <mat-label>{{ 'development.oss.npmPackage' | transloco }}</mat-label>
          <input matInput formControlName="npmPackage" />
          <mat-hint>{{ 'development.oss.npmHint' | transloco }}</mat-hint>
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
          {{ (repo ? 'core.actions.save' : 'core.actions.add') | transloco }}
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
    .hint {
      margin: 0 0 4px;
      color: var(--mat-sys-on-surface-variant);
    }
    .error {
      margin: 0;
      color: var(--mat-sys-error);
    }
  `,
})
export class RepoFormDialog {
  /** `null` — a new repository is being added. */
  protected readonly repo = inject<TrackedRepo | null>(MAT_DIALOG_DATA);
  private readonly api = inject(OpenSourceApi);
  private readonly dialogRef = inject(MatDialogRef<RepoFormDialog, boolean>);

  protected readonly form = inject(NonNullableFormBuilder).group({
    repo: [this.repo?.fullName ?? '', Validators.required],
    npmPackage: [this.repo?.npmPackage ?? ''],
  });
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async save(): Promise<void> {
    const { repo, npmPackage } = this.form.getRawValue();
    const packageName = npmPackage.trim() || null;
    this.saving.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(
        this.repo
          ? this.api.updateRepo(this.repo.id, { npmPackage: packageName })
          : this.api.addRepo({ repo, npmPackage: packageName }),
      );
      this.dialogRef.close(true);
    } catch (error) {
      // For an existing repository a 400 can only be about the package name.
      const key = this.repo ? 'development.errors.npmName' : ERROR_KEYS[errorStatus(error)];
      this.error.set(key ?? 'development.errors.generic');
    } finally {
      this.saving.set(false);
    }
  }
}
