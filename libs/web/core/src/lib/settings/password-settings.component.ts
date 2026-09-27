import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthService } from '../auth/auth.service';

@Component({
  selector: 'pd-password-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    TranslocoPipe,
  ],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-card-title>{{ 'core.settings.password.title' | transloco }}</mat-card-title>
      </mat-card-header>
      <mat-card-content>
        <form class="form" [formGroup]="form" (ngSubmit)="save()">
          <mat-form-field>
            <mat-label>{{ 'core.settings.password.current' | transloco }}</mat-label>
            <input
              matInput
              type="password"
              formControlName="currentPassword"
              autocomplete="current-password"
            />
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'core.settings.password.new' | transloco }}</mat-label>
            <input
              matInput
              type="password"
              formControlName="newPassword"
              autocomplete="new-password"
            />
            <mat-hint>{{ 'core.register.passwordHint' | transloco }}</mat-hint>
          </mat-form-field>
          <button matButton="filled" type="submit" [disabled]="form.invalid || saving()">
            {{ 'core.settings.password.submit' | transloco }}
          </button>
        </form>
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    .form {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding-top: 16px;
    }
    .form button {
      align-self: flex-end;
      margin-top: 8px;
    }
  `,
})
export class PasswordSettingsComponent {
  private readonly auth = inject(AuthService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly transloco = inject(TranslocoService);

  protected readonly saving = signal(false);
  protected readonly form = inject(NonNullableFormBuilder).group({
    currentPassword: ['', Validators.required],
    newPassword: ['', [Validators.required, Validators.minLength(8)]],
  });

  async save(): Promise<void> {
    this.saving.set(true);
    try {
      await this.auth.changePassword(this.form.getRawValue());
      this.form.reset();
      this.notify('core.settings.password.changed');
    } catch (error) {
      const wrong = error instanceof HttpErrorResponse && error.status === 400;
      this.notify(wrong ? 'core.settings.password.wrong' : 'core.login.error');
    } finally {
      this.saving.set(false);
    }
  }

  private notify(key: string): void {
    this.snackBar.open(this.transloco.translate(key), 'OK', { duration: 4000 });
  }
}
