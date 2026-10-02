import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { errorBody, errorStatus, IntegrationGuideComponent } from '@pd/web-core';
import { firstValueFrom } from 'rxjs';
import { MusicApi } from '../music.api';

/**
 * SoundCloud, in Settings → Integrations (see `integrations` in music.module.ts): the link to
 * the profile, and — only for private tracks — the sign-in token of the account.
 */
@Component({
  selector: 'pd-soundcloud-integration',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
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
        <mat-icon mat-card-avatar>cloud</mat-icon>
        <mat-card-title>SoundCloud</mat-card-title>
        <mat-card-subtitle>{{
          'music.soundcloud.connect.description' | transloco
        }}</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        @if (settings.value()?.soundcloud; as s) {
          @if (s.username) {
            <p class="ok">
              <mat-icon inline>check_circle</mat-icon>
              {{ 'music.connect.connectedAs' | transloco }} <b>{{ s.username }}</b>
            </p>
            <p class="hint">
              {{
                (s.withToken
                  ? 'music.soundcloud.connect.withToken'
                  : 'music.soundcloud.connect.withoutToken'
                ) | transloco
              }}
            </p>
            @if (s.lastSyncedAt) {
              <p class="hint">
                {{ 'music.soundcloud.synced' | transloco }}
                {{ s.lastSyncedAt | date: 'd MMM, HH:mm' }}
              </p>
            }
            @if (s.lastError) {
              <p class="error">{{ s.lastError }}</p>
            }
            <button matButton (click)="disconnect()">
              {{ 'music.connect.disconnect' | transloco }}
            </button>
          } @else {
            <p class="hint">{{ 'music.soundcloud.connect.hint' | transloco }}</p>
            <form class="form" [formGroup]="form" (ngSubmit)="connect()">
              <mat-form-field subscriptSizing="dynamic">
                <mat-label>{{ 'music.soundcloud.connect.profile' | transloco }}</mat-label>
                <input
                  matInput
                  formControlName="profile"
                  autocomplete="off"
                  placeholder="https://soundcloud.com/your-name"
                />
              </mat-form-field>
              <mat-form-field subscriptSizing="dynamic">
                <mat-label>{{ 'music.soundcloud.connect.token' | transloco }}</mat-label>
                <input matInput type="password" formControlName="token" autocomplete="off" />
              </mat-form-field>
              <button matButton="filled" type="submit" [disabled]="form.invalid || busy()">
                {{ 'music.connect.connect' | transloco }}
              </button>
            </form>
          }
        }
        <p class="hint">{{ 'music.soundcloud.connect.unofficial' | transloco }}</p>
        <pd-integration-guide guide="music.guide.soundcloud" [steps]="4" />
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    .form {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .form button {
      align-self: flex-end;
    }
    .ok {
      display: flex;
      align-items: center;
      gap: 6px;
      color: var(--mat-sys-primary);
    }
    .hint {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .error {
      color: var(--mat-sys-error);
      font: var(--mat-sys-body-small);
    }
  `,
})
export class SoundcloudIntegration {
  private readonly api = inject(MusicApi);
  private readonly snackBar = inject(MatSnackBar);
  private readonly transloco = inject(TranslocoService);

  protected readonly settings = this.api.settings();
  protected readonly busy = signal(false);
  protected readonly form = inject(NonNullableFormBuilder).group({
    profile: ['', Validators.required],
    token: [''],
  });

  async connect(): Promise<void> {
    const { profile, token } = this.form.getRawValue();
    this.busy.set(true);
    try {
      await firstValueFrom(this.api.connectSoundcloud({ profile, token: token.trim() || null }));
      this.form.reset();
    } catch (error) {
      // SoundCloud's own words for a 400: no such profile, a token of another account.
      const said = (errorBody(error) as { message?: string } | null)?.message;
      const message =
        errorStatus(error) === 400 && said ? said : this.transloco.translate('music.connect.error');
      this.snackBar.open(message, 'OK', { duration: 8000 });
    } finally {
      this.settings.reload();
      this.busy.set(false);
    }
  }

  async disconnect(): Promise<void> {
    if (confirm(this.transloco.translate('music.soundcloud.connect.confirmDisconnect'))) {
      await firstValueFrom(this.api.disconnectSoundcloud());
      this.settings.reload();
    }
  }
}
