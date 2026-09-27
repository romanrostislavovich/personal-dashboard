import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoPipe } from '@jsverse/transloco';
import { COST_PROVIDERS, CostProvider, CostSourceInput, Project } from '@pd/contracts';

export interface CostSourceFormData {
  projects: Project[];
  defaultProjectId: string | null;
}

/** Defaults for each service — the user can change them. */
const PROVIDER_DEFAULTS: Record<CostProvider, { name: string; category: string }> = {
  hetzner: { name: 'Hetzner Cloud', category: 'Хостинг' },
  deepseek: { name: 'DeepSeek API', category: 'AI API' },
};

@Component({
  selector: 'pd-cost-source-form-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    TranslocoPipe,
  ],
  template: `
    <h2 mat-dialog-title>{{ 'finance.costSources.add' | transloco }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content class="form">
        <mat-form-field>
          <mat-label>{{ 'finance.costSources.provider' | transloco }}</mat-label>
          <mat-select formControlName="provider">
            @for (provider of providers; track provider) {
              <mat-option [value]="provider">
                {{ 'finance.costSources.providers.' + provider + '.title' | transloco }}
              </mat-option>
            }
          </mat-select>
        </mat-form-field>

        <p class="hint">
          {{ 'finance.costSources.providers.' + provider() + '.hint' | transloco }}
        </p>

        <mat-form-field>
          <mat-label>{{ 'finance.costSources.token' | transloco }}</mat-label>
          <input matInput type="password" formControlName="apiToken" autocomplete="off" />
          <mat-hint>{{ 'finance.costSources.tokenHint' | transloco }}</mat-hint>
        </mat-form-field>

        <div class="row">
          <mat-form-field>
            <mat-label>{{ 'finance.recurring.name' | transloco }}</mat-label>
            <input matInput formControlName="name" />
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'finance.category' | transloco }}</mat-label>
            <input matInput formControlName="category" />
          </mat-form-field>
        </div>

        <mat-form-field>
          <mat-label>{{ 'finance.wallet' | transloco }}</mat-label>
          <mat-select formControlName="projectId">
            <!-- "Personal" = empty string: mat-select treats null as no selection. -->
            <mat-option value="">{{ 'finance.scope.personal' | transloco }}</mat-option>
            @for (project of data.projects; track project.id) {
              <mat-option [value]="project.id">{{ project.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button matButton type="button" mat-dialog-close>
          {{ 'core.actions.cancel' | transloco }}
        </button>
        <button matButton="filled" type="submit" [disabled]="form.invalid">
          {{ 'finance.costSources.connect' | transloco }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .form {
      display: flex;
      flex-direction: column;
      min-width: min(460px, 80vw);
    }
    .row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-top: 8px;
    }
    .hint {
      margin: 0 0 16px;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
  `,
})
export class CostSourceFormDialog {
  protected readonly data = inject<CostSourceFormData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<CostSourceFormDialog, CostSourceInput>);

  protected readonly providers = COST_PROVIDERS;
  protected readonly form = inject(NonNullableFormBuilder).group({
    provider: ['hetzner' as CostProvider],
    apiToken: ['', [Validators.required, Validators.minLength(10)]],
    name: [PROVIDER_DEFAULTS.hetzner.name, Validators.required],
    category: [PROVIDER_DEFAULTS.hetzner.category, Validators.required],
    projectId: [this.data.defaultProjectId ?? ''],
  });

  protected readonly provider = toSignal(this.form.controls.provider.valueChanges, {
    initialValue: this.form.controls.provider.value,
  });

  constructor() {
    // When the service changes, fill in its name and category.
    this.form.controls.provider.valueChanges.subscribe((provider) =>
      this.form.patchValue(PROVIDER_DEFAULTS[provider]),
    );
  }

  save(): void {
    const value = this.form.getRawValue();
    this.dialogRef.close({ ...value, projectId: value.projectId || null });
  }
}
