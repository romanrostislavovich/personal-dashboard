import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { errorStatus } from '@pd/web-core';
import { firstValueFrom } from 'rxjs';
import { GithubApi } from './github.api';

/** The GitHub token, in Settings → Integrations (see `integrations` in development.module.ts). */
@Component({
  selector: 'pd-github-token-integration',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    TranslocoPipe,
  ],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-icon mat-card-avatar>code</mat-icon>
        <mat-card-title>GitHub</mat-card-title>
        <mat-card-subtitle>{{ 'development.github.token.title' | transloco }}</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        @if (settings.value()?.tokenConfigured) {
          <p class="ok">
            <mat-icon>check_circle</mat-icon>
            {{ 'development.github.token.configured' | transloco }}
          </p>
          <button matButton (click)="removeToken()">
            {{ 'development.github.token.remove' | transloco }}
          </button>
        } @else {
          <p class="hint">{{ 'development.github.token.hint' | transloco }}</p>
          <form class="form" [formGroup]="tokenForm" (ngSubmit)="saveToken()">
            <mat-form-field subscriptSizing="dynamic">
              <mat-label>{{ 'development.github.token.label' | transloco }}</mat-label>
              <input matInput type="password" formControlName="token" autocomplete="off" />
            </mat-form-field>
            <button matButton="filled" type="submit" [disabled]="tokenForm.invalid || busy()">
              {{ 'core.actions.save' | transloco }}
            </button>
          </form>
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    .form {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }
    .form mat-form-field {
      flex: 1;
      min-width: 220px;
    }
    .hint {
      color: var(--mat-sys-on-surface-variant);
    }
    .ok {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--mat-sys-primary);
    }
  `,
})
export class GithubTokenIntegration {
  private readonly api = inject(GithubApi);
  private readonly snackBar = inject(MatSnackBar);
  private readonly transloco = inject(TranslocoService);

  protected readonly settings = this.api.settings();
  protected readonly busy = signal(false);
  protected readonly tokenForm = inject(NonNullableFormBuilder).group({
    token: ['', Validators.required],
  });

  async saveToken(): Promise<void> {
    this.busy.set(true);
    try {
      await firstValueFrom(this.api.saveToken(this.tokenForm.getRawValue().token));
      this.tokenForm.reset();
      this.settings.reload();
    } catch (error) {
      const key =
        errorStatus(error) === 400
          ? 'development.errors.invalidToken'
          : 'development.errors.generic';
      this.snackBar.open(this.transloco.translate(key), 'OK', { duration: 6000 });
    } finally {
      this.busy.set(false);
    }
  }

  async removeToken(): Promise<void> {
    await firstValueFrom(this.api.removeToken());
    this.settings.reload();
  }
}
