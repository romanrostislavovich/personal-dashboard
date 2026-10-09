import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { errorStatus } from '../client/core-requests';
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
    RouterLink,
    TranslocoPipe,
  ],
  template: `
    <mat-card class="login-card" appearance="outlined">
      <mat-card-header>
        <mat-card-title>{{ 'core.login.title' | transloco }}</mat-card-title>
      </mat-card-header>
      <mat-card-content>
        @if (challengeToken()) {
          <!-- Two-factor sign-in: the password was right, now the code from the app -->
          <form class="code-form" (ngSubmit)="submitCode()">
            <p class="hint">{{ 'core.login.codeHint' | transloco }}</p>
            <mat-form-field>
              <mat-label>{{ 'core.login.code' | transloco }}</mat-label>
              <input
                matInput
                name="code"
                inputmode="numeric"
                autocomplete="one-time-code"
                [value]="code()"
                (input)="code.set($any($event.target).value)"
              />
            </mat-form-field>
            @if (error(); as key) {
              <p class="error">{{ key | transloco }}</p>
            }
            <button
              matButton="filled"
              type="submit"
              [disabled]="code().trim().length < 6 || loading()"
            >
              {{ 'core.login.verify' | transloco }}
            </button>
            <button matButton type="button" (click)="startOver()">
              {{ 'core.login.back' | transloco }}
            </button>
          </form>
        } @else {
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
            @if (error(); as key) {
              <p class="error">{{ key | transloco }}</p>
            }
            <button matButton="filled" type="submit" [disabled]="form.invalid || loading()">
              {{ 'core.login.submit' | transloco }}
            </button>
          </form>
        }
        @if (demo()) {
          <div class="demo">
            <p class="hint">{{ 'core.login.demoHint' | transloco }}</p>
            <button matButton="tonal" type="button" [disabled]="loading()" (click)="tryDemo()">
              {{ 'core.login.tryDemo' | transloco }}
            </button>
          </div>
        }
        @if (registrationEnabled()) {
          <p class="switch">
            {{ 'core.login.noAccount' | transloco }}
            <a routerLink="/register">{{ 'core.login.register' | transloco }}</a>
          </p>
        }
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
    .switch {
      margin: 16px 0 0;
      text-align: center;
      color: var(--mat-sys-on-surface-variant);
    }
    .error {
      color: var(--mat-sys-error);
      margin: 0 0 8px;
    }
    .code-form {
      margin-top: 8px;
    }
    .demo {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 24px;
      padding-top: 16px;
      border-top: 1px solid var(--mat-sys-outline-variant);
    }
    .hint {
      margin: 0 0 8px;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly registrationEnabled = signal(false);
  /** A demo instance: the page offers to come in without an account. */
  readonly demo = signal(false);
  /** The translation key of the error to show. */
  readonly error = signal<string | null>(null);
  /** Set after the password step when a 2FA code is needed. */
  readonly challengeToken = signal<string | null>(null);
  readonly code = signal('');
  readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  constructor() {
    this.auth.config().then(
      (config) => {
        this.registrationEnabled.set(config.registrationEnabled);
        this.demo.set(config.demo);
      },
      () => this.registrationEnabled.set(false),
    );
  }

  async submit(): Promise<void> {
    await this.attempt(async () => {
      const { challengeToken } = await this.auth.login(this.form.getRawValue());
      if (challengeToken) {
        this.challengeToken.set(challengeToken);
        return;
      }
      await this.router.navigateByUrl('/');
    });
  }

  async tryDemo(): Promise<void> {
    await this.attempt(async () => {
      await this.auth.tryDemo();
      await this.router.navigateByUrl('/');
    });
  }

  async submitCode(): Promise<void> {
    const challengeToken = this.challengeToken();
    if (!challengeToken) {
      return;
    }
    await this.attempt(async () => {
      await this.auth.completeLogin(challengeToken, this.code());
      await this.router.navigateByUrl('/');
    });
  }

  startOver(): void {
    this.challengeToken.set(null);
    this.code.set('');
    this.error.set(null);
  }

  private async attempt(step: () => Promise<void>): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      await step();
    } catch (error) {
      this.error.set(
        errorStatus(error) === 429
          ? 'core.login.tooMany'
          : this.challengeToken()
            ? 'core.login.wrongCode'
            : 'core.login.error',
      );
    } finally {
      this.loading.set(false);
    }
  }
}
