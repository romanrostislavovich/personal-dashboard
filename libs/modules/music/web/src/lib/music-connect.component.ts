import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { MusicSettings } from '@pd/contracts';
import { firstValueFrom } from 'rxjs';
import { MusicApi } from './music.api';

/** Connecting sources: Last.fm (username + API key) and Spotify (OAuth). */
@Component({
  selector: 'pd-music-connect',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    DecimalPipe,
    MatProgressBarModule,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    TranslocoPipe,
  ],
  template: `
    @let s = settings();
    <div class="cards">
      <mat-card appearance="outlined">
        <mat-card-header>
          <mat-card-title>Last.fm</mat-card-title>
          <mat-card-subtitle>{{ 'music.connect.lastfmDescription' | transloco }}</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          @if (s.lastfm.username) {
            <p class="ok">
              <mat-icon inline>check_circle</mat-icon>
              {{ 'music.connect.connectedAs' | transloco }} <b>{{ s.lastfm.username }}</b>
            </p>
            @if (s.lastfm.lastSyncedAt) {
              <p class="hint">
                {{ 'music.connect.synced' | transloco }}
                {{ s.lastfm.lastSyncedAt | date: 'd MMM, HH:mm' }}
              </p>
            }
            @if (s.lastfm.lastError) {
              <p class="error">{{ s.lastfm.lastError }}</p>
            }
            @if (s.lastfm.history; as h) {
              <div class="history">
                @if (h.complete) {
                  <p class="hint">
                    <mat-icon inline>history</mat-icon>
                    {{ 'music.history.complete' | transloco: { count: (h.imported | number) } }}
                  </p>
                } @else {
                  <p class="hint">
                    {{
                      'music.history.progress'
                        | transloco
                          : {
                              imported: (h.imported | number),
                              total: h.total === null ? '?' : (h.total | number),
                            }
                    }}
                  </p>
                  <mat-progress-bar
                    [mode]="h.total ? 'determinate' : 'indeterminate'"
                    [value]="h.total ? (100 * h.imported) / h.total : 0"
                  />
                  <p class="hint">
                    {{ (h.running ? 'music.history.running' : 'music.history.paused') | transloco }}
                  </p>
                }
              </div>
            }
          } @else {
            <p class="hint">{{ 'music.connect.lastfmHint' | transloco }}</p>
            <form class="form" [formGroup]="form" (ngSubmit)="connectLastfm()">
              <mat-form-field subscriptSizing="dynamic">
                <mat-label>{{ 'music.connect.username' | transloco }}</mat-label>
                <input matInput formControlName="username" autocomplete="off" />
              </mat-form-field>
              <mat-form-field subscriptSizing="dynamic">
                <mat-label>API key</mat-label>
                <input matInput type="password" formControlName="apiKey" autocomplete="off" />
              </mat-form-field>
              <button matButton="filled" type="submit" [disabled]="form.invalid || busy()">
                {{ 'music.connect.connect' | transloco }}
              </button>
            </form>
          }
        </mat-card-content>
        @if (s.lastfm.username) {
          <mat-card-actions align="end">
            @if (s.lastfm.history && !s.lastfm.history.complete && !s.lastfm.history.running) {
              <button matButton (click)="importHistory()" [disabled]="busy()">
                <mat-icon>history</mat-icon> {{ 'music.history.start' | transloco }}
              </button>
            }
            <button matButton (click)="syncLastfm()" [disabled]="busy()">
              <mat-icon>sync</mat-icon> {{ 'music.connect.syncNow' | transloco }}
            </button>
            <button matButton (click)="disconnectLastfm()">
              {{ 'music.connect.disconnect' | transloco }}
            </button>
          </mat-card-actions>
        }
      </mat-card>

      <mat-card appearance="outlined">
        <mat-card-header>
          <mat-card-title>Spotify</mat-card-title>
          <mat-card-subtitle>{{
            'music.connect.spotifyDescription' | transloco
          }}</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          @if (!s.spotify.available) {
            <p class="hint">{{ 'music.connect.spotifyNotConfigured' | transloco }}</p>
          } @else if (s.spotify.connected) {
            <p class="ok">
              <mat-icon inline>check_circle</mat-icon>
              {{ 'music.connect.spotifyConnected' | transloco }}
            </p>
          } @else {
            <p class="hint">{{ 'music.connect.spotifyHint' | transloco }}</p>
          }
        </mat-card-content>
        @if (s.spotify.available) {
          <mat-card-actions align="end">
            @if (s.spotify.connected) {
              <button matButton (click)="disconnectSpotify()">
                {{ 'music.connect.disconnect' | transloco }}
              </button>
            } @else {
              <button matButton="filled" (click)="connectSpotify()">
                {{ 'music.connect.connect' | transloco }}
              </button>
            }
          </mat-card-actions>
        }
      </mat-card>
    </div>
  `,
  styles: `
    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(360px, 100%), 1fr));
      gap: 16px;
    }
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
    .history {
      margin-top: 12px;
    }
    .history .hint {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 4px 0;
    }
  `,
})
export class MusicConnectComponent {
  readonly settings = input.required<MusicSettings>();
  /** Something was connected/disconnected/refreshed — time for the page to reload data. */
  readonly changed = output<void>();

  private readonly api = inject(MusicApi);
  private readonly snackBar = inject(MatSnackBar);
  private readonly transloco = inject(TranslocoService);

  protected readonly busy = signal(false);
  protected readonly form = inject(NonNullableFormBuilder).group({
    username: ['', Validators.required],
    apiKey: ['', [Validators.required, Validators.pattern(/^[a-fA-F0-9]{32}$/)]],
  });

  async connectLastfm(): Promise<void> {
    await this.run(() => firstValueFrom(this.api.connectLastfm(this.form.getRawValue())));
  }

  async syncLastfm(): Promise<void> {
    await this.run(() => firstValueFrom(this.api.syncLastfm()));
  }

  async importHistory(): Promise<void> {
    await this.run(() => firstValueFrom(this.api.importLastfmHistory()));
  }

  async disconnectLastfm(): Promise<void> {
    if (confirm(this.transloco.translate('music.connect.confirmDisconnect'))) {
      await this.run(() => firstValueFrom(this.api.disconnectLastfm()));
    }
  }

  /** Go to the Spotify sign-in page; it sends us back to /music?spotify=connected. */
  async connectSpotify(): Promise<void> {
    const { url } = await firstValueFrom(this.api.spotifyConnectUrl());
    window.location.href = url;
  }

  async disconnectSpotify(): Promise<void> {
    await this.run(() => firstValueFrom(this.api.disconnectSpotify()));
  }

  private async run(action: () => Promise<unknown>): Promise<void> {
    this.busy.set(true);
    try {
      await action();
      this.changed.emit();
    } catch (error) {
      const key =
        error instanceof HttpErrorResponse && error.status === 400
          ? 'music.connect.invalid'
          : 'music.connect.error';
      this.snackBar.open(this.transloco.translate(key), 'OK', { duration: 6000 });
    } finally {
      this.busy.set(false);
    }
  }
}
