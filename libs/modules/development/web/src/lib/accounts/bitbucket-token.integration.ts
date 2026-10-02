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

/**
 * The Bitbucket credentials, in Settings → Integrations: Bitbucket signs in with the e-mail of
 * the Atlassian account and an API token, so the card asks for both.
 */
@Component({
  selector: 'pd-bitbucket-token-integration',
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
        <mat-icon mat-card-avatar>source</mat-icon>
        <mat-card-title>Bitbucket</mat-card-title>
        <mat-card-subtitle>{{ 'development.bitbucket.token.title' | transloco }}</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        @if (settings.value()?.bitbucket) {
          <p class="ok">
            <mat-icon>check_circle</mat-icon>
            {{ 'development.github.token.configured' | transloco }}
          </p>
          <button matButton (click)="remove()">
            {{ 'development.github.token.remove' | transloco }}
          </button>
        } @else {
          <p class="hint">{{ 'development.bitbucket.token.hint' | transloco }}</p>
          <form class="form" [formGroup]="form" (ngSubmit)="save()">
            <mat-form-field subscriptSizing="dynamic">
              <mat-label>{{ 'development.bitbucket.token.email' | transloco }}</mat-label>
              <input matInput type="email" formControlName="email" autocomplete="off" />
            </mat-form-field>
            <mat-form-field subscriptSizing="dynamic">
              <mat-label>{{ 'development.bitbucket.token.label' | transloco }}</mat-label>
              <input matInput type="password" formControlName="token" autocomplete="off" />
            </mat-form-field>
            <button matButton="filled" type="submit" [disabled]="form.invalid || busy()">
              {{ 'core.actions.save' | transloco }}
            </button>
          </form>
        }
        <pd-integration-guide
          guide="development.bitbucket.token.guide"
          [steps]="4"
          link="https://id.atlassian.com/manage-profile/security/api-tokens"
        />
      </mat-card-content>
    </mat-card>
  `,
  styleUrl: './token.integration.scss',
})
export class BitbucketTokenIntegration {
  private readonly api = inject(AccountsApi);
  private readonly snackBar = inject(MatSnackBar);
  private readonly transloco = inject(TranslocoService);

  protected readonly settings = this.api.settings();
  protected readonly busy = signal(false);
  protected readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
    token: ['', Validators.required],
  });

  async save(): Promise<void> {
    this.busy.set(true);
    try {
      await firstValueFrom(this.api.saveBitbucketToken(this.form.getRawValue()));
      this.form.reset();
      this.settings.reload();
    } catch (error) {
      const key =
        errorStatus(error) === 400
          ? 'development.errors.tokenRejected'
          : 'development.errors.generic';
      this.snackBar.open(this.transloco.translate(key, { service: 'Bitbucket' }), 'OK', {
        duration: 6000,
      });
    } finally {
      this.busy.set(false);
    }
  }

  async remove(): Promise<void> {
    await firstValueFrom(this.api.removeToken('bitbucket'));
    this.settings.reload();
  }
}
