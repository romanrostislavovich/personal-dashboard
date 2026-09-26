import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from './auth.service';

@Component({
  selector: 'pd-login-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    TranslocoPipe,
  ],
  template: `
    <mat-card class="login-card" appearance="outlined">
      <mat-card-header>
        <mat-card-title>{{ 'core.login.title' | transloco }}</mat-card-title>
      </mat-card-header>
      <mat-card-content>
        <form [formGroup]="form" (ngSubmit)="submit()">
          <mat-form-field>
            <mat-label>{{ 'core.login.email' | transloco }}</mat-label>
            <input matInput type="email" formControlName="email" autocomplete="username" />
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'core.login.password' | transloco }}</mat-label>
            <input
              matInput
              type="password"
              formControlName="password"
              autocomplete="current-password"
            />
          </mat-form-field>
          @if (error()) {
            <p class="error">{{ 'core.login.error' | transloco }}</p>
          }
          <button matButton="filled" type="submit" [disabled]="form.invalid || loading()">
            {{ 'core.login.submit' | transloco }}
          </button>
        </form>
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    :host {
      display: grid;
      place-items: center;
      min-height: 100vh;
      padding: 16px;
      box-sizing: border-box;
    }
    .login-card {
      width: min(400px, 100%);
    }
    form {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 16px;
    }
    .error {
      color: var(--mat-sys-error);
      margin: 0 0 8px;
    }
  `,
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly error = signal(false);
  readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  async submit(): Promise<void> {
    this.loading.set(true);
    this.error.set(false);
    try {
      await this.auth.login(this.form.getRawValue());
      await this.router.navigateByUrl('/');
    } catch {
      this.error.set(true);
    } finally {
      this.loading.set(false);
    }
  }
}
