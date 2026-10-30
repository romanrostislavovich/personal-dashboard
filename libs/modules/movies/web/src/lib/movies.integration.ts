import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import {
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatCardModule} from '@angular/material/card';
import {MatChipsModule} from '@angular/material/chips';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {MatSlideToggleModule} from '@angular/material/slide-toggle';
import {MatSnackBar} from '@angular/material/snack-bar';
import {TranslocoPipe, TranslocoService} from '@jsverse/transloco';
import {MovieSettings} from '@pd/contracts';
import {errorStatus, IntegrationGuideComponent} from '@pd/web-core';
import {firstValueFrom} from 'rxjs';
import {MoviesApi} from './movies.api';

/**
 * Movies in Settings → Integrations: the TMDB key that finds the titles, whether the browser
 * extension notes what plays, and the sites it leaves alone.
 */
@Component({
  selector: 'pd-movies-integration',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSlideToggleModule,
    TranslocoPipe,
    IntegrationGuideComponent,
  ],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-icon mat-card-avatar>movie</mat-icon>
        <mat-card-title>TMDB</mat-card-title>
        <mat-card-subtitle>{{
          'movies.integration.subtitle' | transloco
        }}</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        @if (status.value(); as s) {
          @if (s.tmdb) {
            <p class="ok">
              <mat-icon>check_circle</mat-icon>
              {{ 'movies.integration.connected' | transloco }}
            </p>
            <button matButton (click)="removeKey()">
              {{ 'movies.integration.disconnect' | transloco }}
            </button>
          } @else {
            <p class="hint">{{ 'movies.integration.hint' | transloco }}</p>
            <form class="form" [formGroup]="form" (ngSubmit)="saveKey()">
              <mat-form-field subscriptSizing="dynamic">
                <mat-label>{{
                  'movies.integration.key' | transloco
                }}</mat-label>
                <input
                  matInput
                  type="password"
                  formControlName="key"
                  autocomplete="off"
                />
              </mat-form-field>
              <button
                matButton="filled"
                type="submit"
                [disabled]="form.invalid || busy()"
              >
                {{ 'core.actions.save' | transloco }}
              </button>
            </form>
          }

          <mat-slide-toggle
            class="track"
            [checked]="s.settings.track"
            (change)="save({...s.settings, track: $event.checked})"
          >
            {{ 'movies.integration.track' | transloco }}
          </mat-slide-toggle>
          <p class="hint">{{ 'movies.integration.trackHint' | transloco }}</p>

          @if (s.settings.ignoredSites.length) {
            <p class="label">{{ 'movies.integration.ignored' | transloco }}</p>
            <mat-chip-set>
              @for (site of s.settings.ignoredSites; track site) {
                <mat-chip (removed)="unignore(s.settings, site)">
                  {{ site }}
                  <button
                    matChipRemove
                    [attr.aria-label]="'core.actions.delete' | transloco"
                  >
                    <mat-icon>cancel</mat-icon>
                  </button>
                </mat-chip>
              }
            </mat-chip-set>
          }
        }
        <pd-integration-guide
          guide="movies.integration.guide"
          [steps]="4"
          link="https://www.themoviedb.org/settings/api"
        />
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
    .track {
      display: block;
      margin-top: 16px;
    }
    .label {
      font: var(--mat-sys-label-large);
    }
  `,
})
export class MoviesIntegration {
  private readonly api = inject(MoviesApi);
  private readonly snackBar = inject(MatSnackBar);
  private readonly transloco = inject(TranslocoService);

  protected readonly status = this.api.status();
  protected readonly busy = signal(false);
  protected readonly form = inject(NonNullableFormBuilder).group({
    key: ['', [Validators.required, Validators.minLength(20)]],
  });

  async saveKey(): Promise<void> {
    this.busy.set(true);
    try {
      await firstValueFrom(
        this.api.setTmdbKey(this.form.getRawValue().key.trim()),
      );
      this.form.reset();
      this.status.reload();
    } catch (error) {
      const key =
        errorStatus(error) === 400
          ? 'movies.integration.invalid'
          : 'movies.errors.generic';
      this.snackBar.open(this.transloco.translate(key), 'OK', {duration: 6000});
    } finally {
      this.busy.set(false);
    }
  }

  async removeKey(): Promise<void> {
    await firstValueFrom(this.api.removeTmdbKey());
    this.status.reload();
  }

  async save(settings: MovieSettings): Promise<void> {
    await firstValueFrom(this.api.setSettings(settings));
    this.status.reload();
  }

  unignore(settings: MovieSettings, site: string): Promise<void> {
    return this.save({
      ...settings,
      ignoredSites: settings.ignoredSites.filter(one => one !== site),
    });
  }
}
