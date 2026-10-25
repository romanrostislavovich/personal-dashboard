import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { IntegrationGuideComponent } from '@pd/web-core';
import { firstValueFrom } from 'rxjs';
import { ActivityApi } from '../activity.api';

/**
 * Google for Activity → Places, in Settings → Integrations: the Places key (kept on the server)
 * names a stay OpenStreetMap named wrong, the Maps key (seen by the browser, so restricted to
 * the dashboard's addresses in Google Cloud) draws the map. Both are optional: without them
 * OpenStreetMap does both.
 */
@Component({
  selector: 'pd-google-places-integration',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IntegrationGuideComponent,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    ReactiveFormsModule,
    TranslocoPipe,
  ],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-icon mat-card-avatar>map</mat-icon>
        <mat-card-title>Google Maps · Google Places</mat-card-title>
        <mat-card-subtitle>{{ 'activity.google.subtitle' | transloco }}</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content class="content">
        @if (settings.value(); as s) {
          @for (which of kinds; track which) {
            @if (which === 'places' ? s.googlePlaces : s.googleMapsKey) {
              <p class="ok">
                <mat-icon inline>check_circle</mat-icon>
                {{ 'activity.google.' + which + 'Saved' | transloco }}
                <button matButton (click)="remove(which)">
                  {{ 'activity.google.remove' | transloco }}
                </button>
              </p>
            } @else {
              <form class="form" [formGroup]="form" (ngSubmit)="save(which)">
                <mat-form-field subscriptSizing="dynamic">
                  <mat-label>{{ 'activity.google.' + which + 'Key' | transloco }}</mat-label>
                  <input
                    matInput
                    type="password"
                    autocomplete="off"
                    [formControlName]="which === 'places' ? 'placesKey' : 'mapsKey'"
                  />
                </mat-form-field>
                <button matButton="filled" type="submit" [disabled]="busy()">
                  {{ 'core.actions.save' | transloco }}
                </button>
              </form>
            }
          }
        }
        <pd-integration-guide
          guide="activity.google.guide"
          [steps]="5"
          link="https://console.cloud.google.com/google/maps-apis/credentials"
        />
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    .content {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .form {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }
    .form mat-form-field {
      flex: 1 1 220px;
    }
    .ok {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--mat-sys-primary);
      margin: 0;
    }
  `,
})
export class GooglePlacesIntegration {
  private readonly api = inject(ActivityApi);
  private readonly snackBar = inject(MatSnackBar);
  private readonly transloco = inject(TranslocoService);

  protected readonly kinds = ['places', 'maps'] as const;
  protected readonly settings = this.api.placesSettings();
  protected readonly busy = signal(false);
  protected readonly form = inject(NonNullableFormBuilder).group({ placesKey: '', mapsKey: '' });

  async save(which: 'places' | 'maps'): Promise<void> {
    const value = this.form.getRawValue()[which === 'places' ? 'placesKey' : 'mapsKey'].trim();
    if (value.length < 20) {
      return;
    }
    this.busy.set(true);
    try {
      await firstValueFrom(
        this.api.saveGoogleKeys(which === 'places' ? { placesKey: value } : { mapsKey: value }),
      );
      this.form.reset();
      this.settings.reload();
    } catch {
      this.snackBar.open(this.transloco.translate('activity.google.invalid'), 'OK', {
        duration: 6000,
      });
    } finally {
      this.busy.set(false);
    }
  }

  async remove(which: 'places' | 'maps'): Promise<void> {
    await firstValueFrom(this.api.removeGoogleKey(which));
    this.settings.reload();
  }
}
