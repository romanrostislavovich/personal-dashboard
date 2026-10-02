import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { IntegrationGuideComponent, errorStatus } from '@pd/web-core';
import { firstValueFrom } from 'rxjs';
import { AccountsApi } from './accounts.api';

/** The GitLab token, in Settings → Integrations (see `integrations` in development.module.ts). */
@Component({
  selector: 'pd-gitlab-token-integration',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    IntegrationGuideComponent,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    TranslocoPipe,
  ],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-icon mat-card-avatar>merge</mat-icon>
        <mat-card-title>GitLab</mat-card-title>
        <mat-card-subtitle>{{ 'development.gitlab.token.title' | transloco }}</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        @if (settings.value()?.gitlab) {
          <p class="ok">
            <mat-icon>check_circle</mat-icon>
            {{ 'development.github.token.configured' | transloco }}
          </p>
          <button matButton (click)="remove()">
            {{ 'development.github.token.remove' | transloco }}
          </button>
        } @else {
          <p class="hint">{{ 'development.gitlab.token.hint' | transloco }}</p>
          <form class="form" [formGroup]="form" (ngSubmit)="save()">
            <mat-form-field subscriptSizing="dynamic">
              <mat-label>{{ 'development.github.token.label' | transloco }}</mat-label>
              <input matInput type="password" formControlName="token" autocomplete="off" />
            </mat-form-field>
            <button matButton="filled" type="submit" [disabled]="form.invalid || busy()">
              {{ 'core.actions.save' | transloco }}
            </button>
          </form>
        }
        <pd-integration-guide
          guide="development.gitlab.token.guide"
          [steps]="3"
          link="https://gitlab.com/-/user_settings/personal_access_tokens"
        />
      </mat-card-content>
    </mat-card>
  `,
  styleUrl: './token.integration.scss',
})
export class GitlabTokenIntegration {
  private readonly api = inject(AccountsApi);
  private readonly snackBar = inject(MatSnackBar);
  private readonly transloco = inject(TranslocoService);

  protected readonly settings = this.api.settings();
  protected readonly busy = signal(false);
  protected readonly form = inject(NonNullableFormBuilder).group({
    token: ['', Validators.required],
  });

  async save(): Promise<void> {
    this.busy.set(true);
    try {
      await firstValueFrom(this.api.saveGitlabToken(this.form.getRawValue().token));
      this.form.reset();
      this.settings.reload();
    } catch (error) {
      const key =
        errorStatus(error) === 400
          ? 'development.errors.tokenRejected'
          : 'development.errors.generic';
      this.snackBar.open(this.transloco.translate(key, { service: 'GitLab' }), 'OK', {
        duration: 6000,
      });
    } finally {
      this.busy.set(false);
    }
  }

  async remove(): Promise<void> {
    await firstValueFrom(this.api.removeToken('gitlab'));
    this.settings.reload();
  }
}
