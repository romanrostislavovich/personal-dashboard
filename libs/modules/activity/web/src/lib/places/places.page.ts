import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { addDays, FrequentPlace, parseLocalDate, PlacesEntry, toLocalDate } from '@pd/contracts';
import { DurationPipe, todayLocalDate } from '@pd/web-core';
import { firstValueFrom } from 'rxjs';
import { ActivityApi } from '../activity.api';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A point on OpenStreetMap: opened by the user, so nothing goes to it by itself. */
function mapUrl(latitude: number, longitude: number): string {
  const lat = latitude.toFixed(5);
  const lon = longitude.toFixed(5);
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`;
}

function seconds(entry: { startedAt: string; endedAt: string }): number {
  return (Date.parse(entry.endedAt) - Date.parse(entry.startedAt)) / 1000;
}

/**
 * Activity → Places: where a day went, from the phone's location (the Android app takes a
 * low-power fix every 15 minutes once allowed) — the places it was spent at and the trips between
 * them, and the places of the last 30 days, which the user names ("Home", "Work").
 */
@Component({
  selector: 'pd-activity-places-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    DecimalPipe,
    DurationPipe,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatTooltipModule,
    TranslocoPipe,
  ],
  template: `
    <div class="day-bar">
      <button
        matIconButton
        (click)="shift(-1)"
        [attr.aria-label]="'activity.places.previous' | transloco"
      >
        <mat-icon>chevron_left</mat-icon>
      </button>
      <span class="day">{{ day() | date: 'EEEE, d MMMM' }}</span>
      <button
        matIconButton
        (click)="shift(1)"
        [disabled]="isToday()"
        [attr.aria-label]="'activity.places.next' | transloco"
      >
        <mat-icon>chevron_right</mat-icon>
      </button>
    </div>

    @if (overview.value(); as o) {
      <mat-card appearance="outlined">
        <mat-card-header>
          <mat-card-title>
            {{ 'activity.places.dayTitle' | transloco: { places: stays().length } }}
          </mat-card-title>
          @if (o.meters) {
            <mat-card-subtitle>
              {{ 'activity.places.km' | transloco: { km: (o.meters / 1000 | number: '1.0-1') } }}
            </mat-card-subtitle>
          }
        </mat-card-header>
        <mat-card-content class="padded">
          @if (o.points === 0) {
            <p class="hint">{{ 'activity.places.none' | transloco }}</p>
          } @else if (!o.entries.length) {
            <p class="hint">{{ 'activity.places.few' | transloco }}</p>
          }
          @for (entry of o.entries; track entry.startedAt) {
            <div class="entry" [class.trip]="entry.kind === 'trip'">
              <mat-icon>{{ entry.kind === 'stay' ? 'place' : 'route' }}</mat-icon>
              <div class="what">
                @if (entry.kind === 'stay') {
                  <div class="name">
                    {{ entry.name ?? ('activity.places.unnamed' | transloco) }}
                  </div>
                } @else {
                  <div class="name">
                    {{
                      'activity.places.trip'
                        | transloco: { km: (entry.meters / 1000 | number: '1.0-1') }
                    }}
                  </div>
                }
                <div class="when">
                  {{ entry.startedAt | date: 'HH:mm' }}–{{ entry.endedAt | date: 'HH:mm' }} ·
                  {{ duration(entry) | pdDuration }}
                </div>
              </div>
              @if (entry.kind === 'stay') {
                @if (!entry.placeId) {
                  <button matButton (click)="name(entry.latitude, entry.longitude)">
                    {{ 'activity.places.name' | transloco }}
                  </button>
                }
                <a
                  matIconButton
                  [href]="map(entry.latitude, entry.longitude)"
                  target="_blank"
                  rel="noopener"
                  [matTooltip]="'activity.places.map' | transloco"
                  [attr.aria-label]="'activity.places.map' | transloco"
                >
                  <mat-icon>map</mat-icon>
                </a>
              }
            </div>
          }
        </mat-card-content>
      </mat-card>

      @if (o.frequent.length) {
        <mat-card appearance="outlined">
          <mat-card-header>
            <mat-card-title>{{ 'activity.places.frequent' | transloco }}</mat-card-title>
            <mat-card-subtitle>{{ 'activity.places.frequentHint' | transloco }}</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content class="padded">
            @for (place of o.frequent; track $index) {
              <div class="entry">
                <mat-icon>{{ place.placeId ? 'bookmark' : 'place' }}</mat-icon>
                <div class="what">
                  <div class="name">
                    {{ place.name ?? ('activity.places.unnamed' | transloco) }}
                  </div>
                  <div class="when">
                    {{ place.seconds | pdDuration }} ·
                    {{ 'activity.places.visits' | transloco: { count: place.visits } }}
                  </div>
                </div>
                @if (place.placeId) {
                  <button
                    matIconButton
                    (click)="rename(place)"
                    [matTooltip]="'activity.places.rename' | transloco"
                    [attr.aria-label]="'activity.places.rename' | transloco"
                  >
                    <mat-icon>edit</mat-icon>
                  </button>
                  <button
                    matIconButton
                    (click)="forget(place)"
                    [matTooltip]="'activity.places.forget' | transloco"
                    [attr.aria-label]="'activity.places.forget' | transloco"
                  >
                    <mat-icon>bookmark_remove</mat-icon>
                  </button>
                } @else {
                  <button matButton (click)="name(place.latitude, place.longitude)">
                    {{ 'activity.places.name' | transloco }}
                  </button>
                }
                <a
                  matIconButton
                  [href]="map(place.latitude, place.longitude)"
                  target="_blank"
                  rel="noopener"
                  [matTooltip]="'activity.places.map' | transloco"
                  [attr.aria-label]="'activity.places.map' | transloco"
                >
                  <mat-icon>map</mat-icon>
                </a>
              </div>
            }
          </mat-card-content>
        </mat-card>
      }
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .day-bar {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .day {
      min-width: 12em;
      text-align: center;
      font-weight: 500;
    }
    .padded {
      padding-top: 12px;
    }
    .entry {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 6px 0;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }
    .entry.trip {
      color: var(--mat-sys-on-surface-variant);
    }
    .what {
      flex: 1;
      min-width: 0;
    }
    .name {
      font-weight: 500;
    }
    .when,
    .hint {
      color: var(--mat-sys-on-surface-variant);
      font-size: 0.85rem;
    }
  `,
})
export class PlacesPage {
  private readonly api = inject(ActivityApi);
  private readonly transloco = inject(TranslocoService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /** From the address (the life timeline links a day), else today. */
  protected readonly day = signal(this.initialDay());
  protected readonly isToday = computed(() => this.day() >= todayLocalDate());
  protected readonly overview = this.api.places(() => this.day());
  protected readonly stays = computed(() =>
    (this.overview.value()?.entries ?? []).filter((entry) => entry.kind === 'stay'),
  );
  protected readonly map = mapUrl;
  protected readonly duration = (entry: PlacesEntry) => seconds(entry);

  protected shift(days: number): void {
    const day = toLocalDate(addDays(parseLocalDate(this.day()), days));
    this.day.set(day);
    void this.router.navigate([], { queryParams: { day }, replaceUrl: true });
  }

  protected async name(latitude: number, longitude: number): Promise<void> {
    const name = prompt(this.transloco.translate('activity.places.namePrompt'))?.trim();
    if (name) {
      await firstValueFrom(this.api.addPlace({ name, latitude, longitude, radiusM: 150 }));
      this.overview.reload();
    }
  }

  protected async rename(place: FrequentPlace): Promise<void> {
    const name = prompt(
      this.transloco.translate('activity.places.namePrompt'),
      place.name ?? '',
    )?.trim();
    if (name && place.placeId) {
      await firstValueFrom(this.api.renamePlace(place.placeId, name));
      this.overview.reload();
    }
  }

  protected async forget(place: FrequentPlace): Promise<void> {
    if (place.placeId) {
      await firstValueFrom(this.api.removePlace(place.placeId));
      this.overview.reload();
    }
  }

  private initialDay(): string {
    const day = this.route.snapshot.queryParamMap.get('day');
    return day && DAY.test(day) ? day : todayLocalDate();
  }
}
