import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { initialLanguage } from '../i18n/language';
import { AuthService } from './auth.service';

/** Sign-up — available only if the server allows it (ALLOW_REGISTRATION=true). */
@Component({
  selector: 'pd-register-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    TranslocoPipe,
  ],
  template: `
    <mat-card class="card" appearance="outlined">
      <mat-card-header>
        <mat-card-title>{{ 'core.register.title' | transloco }}</mat-card-title>
      </mat-card-header>
      <mat-card-content>
        <form [formGroup]="form" (ngSubmit)="submit()">
          <mat-form-field>
            <mat-label>{{ 'core.register.name' | transloco }}</mat-label>
            <input matInput formControlName="displayName" autocomplete="name" />
          </mat-form-field>
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
              autocomplete="new-password"
            />
            <mat-hint>{{ 'core.register.passwordHint' | transloco }}</mat-hint>
          </mat-form-field>
          @if (errorKey(); as key) {
            <p class="error">{{ key | transloco }}</p>
          }
          <button matButton="filled" type="submit" [disabled]="form.invalid || loading()">
            {{ 'core.register.submit' | transloco }}
          </button>
        </form>
        <p class="switch">
          {{ 'core.register.haveAccount' | transloco }}
          <a routerLink="/login">{{ 'core.register.login' | transloco }}</a>
        </p>
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
    .card {
      width: min(400px, 100%);
    }
    form {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 16px;
    }
    .switch {
      margin: 16px 0 0;
      text-align: center;
      color: var(--mat-sys-on-surface-variant);
    }
    .error {
      color: var(--mat-sys-error);
      margin: 0 0 8px;
    }
  `,
})
export class RegisterPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly errorKey = signal<string | null>(null);
  readonly form = inject(NonNullableFormBuilder).group({
    displayName: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  async submit(): Promise<void> {
    this.loading.set(true);
    this.errorKey.set(null);
    try {
      // The new account's language is the one the UI is currently shown in.
      await this.auth.register({ ...this.form.getRawValue(), locale: initialLanguage() });
      await this.router.navigateByUrl('/');
    } catch (error) {
      const status = error instanceof HttpErrorResponse ? error.status : 0;
      this.errorKey.set(
        status === 409
          ? 'core.register.errorExists'
          : status === 403
            ? 'core.register.errorDisabled'
            : 'core.login.error',
      );
    } finally {
      this.loading.set(false);
    }
  }
}
