import {DatePipe, DecimalPipe} from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatButtonToggleModule} from '@angular/material/button-toggle';
import {MatCardModule} from '@angular/material/card';
import {MatIconModule} from '@angular/material/icon';
import {MatSnackBar} from '@angular/material/snack-bar';
import {MatTooltipModule} from '@angular/material/tooltip';
import {ActivatedRoute, Router} from '@angular/router';
import {TranslocoPipe, TranslocoService} from '@jsverse/transloco';
import {
  addDays,
  FoundPlaceName,
  FrequentPlace,
  parseLocalDate,
  PlacesEntry,
  toLocalDate,
  TripMode,
} from '@pd/contracts';
import {DurationPipe, todayLocalDate} from '@pd/web-core';
import {firstValueFrom} from 'rxjs';
import {ActivityApi} from '../activity.api';
import {PlacesImportComponent} from './places-import.component';
import {PlacesMapComponent} from './places-map.component';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** The map the user picked last on this device. */
const MAP_KEY = 'pd.places.map';
const MODE_ICONS: Record<TripMode, string> = {
  walk: 'directions_walk',
  bike: 'directions_bike',
  ride: 'directions_car',
};

/** A point on OpenStreetMap: opened by the user, so nothing goes to it by itself. */
function mapUrl(latitude: number, longitude: number): string {
  const lat = latitude.toFixed(5);
  const lon = longitude.toFixed(5);
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`;
}

function seconds(entry: {startedAt: string; endedAt: string}): number {
  return (Date.parse(entry.endedAt) - Date.parse(entry.startedAt)) / 1000;
}

function savedMap(): 'osm' | 'google' {
  try {
    return localStorage.getItem(MAP_KEY) === 'google' ? 'google' : 'osm';
  } catch {
    return 'osm';
  }
}

/**
 * Activity → Places: where a day went, like the timeline of Google Maps — the routes on a map,
 * the places the day was spent at with their names (the user's own, else what OpenStreetMap or
 * Google calls them), how each trip went, and the places of the last 30 days.
 */
@Component({
  selector: 'pd-activity-places-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    DecimalPipe,
    DurationPipe,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatIconModule,
    MatTooltipModule,
    PlacesImportComponent,
    PlacesMapComponent,
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
      @if (googleMapsKey()) {
        <mat-button-toggle-group
          class="map-switch"
          [value]="map()"
          (change)="pickMap($event.value)"
          [attr.aria-label]="'activity.places.mapKind' | transloco"
        >
          <mat-button-toggle value="osm">OpenStreetMap</mat-button-toggle>
          <mat-button-toggle value="google">Google</mat-button-toggle>
        </mat-button-toggle-group>
      }
    </div>

    @if (overview.value(); as o) {
      <pd-places-map
        [entries]="o.entries"
        [frequent]="o.frequent"
        [labelOf]="label"
        [googleKey]="map() === 'google' ? googleMapsKey() : null"
      />

      <mat-card appearance="outlined">
        <mat-card-header>
          <mat-card-title>
            {{
              'activity.places.dayTitle' | transloco: {places: stays().length}
            }}
          </mat-card-title>
          @if (o.meters) {
            <mat-card-subtitle>
              {{
                'activity.places.km'
                  | transloco: {km: (o.meters / 1000 | number: '1.0-1')}
              }}
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
              @if (entry.kind === 'stay') {
                <mat-icon>{{ entry.placeId ? 'bookmark' : 'place' }}</mat-icon>
                <div class="what">
                  <div class="name">{{ label(entry) }}</div>
                  <div class="when">
                    {{ entry.startedAt | date: 'HH:mm' }}–{{
                      entry.endedAt | date: 'HH:mm'
                    }}
                    ·
                    {{ duration(entry) | pdDuration }}
                    @if (!entry.placeId && entry.found?.kind; as kind) {
                      · {{ kindLabel(kind) }}
                    }
                  </div>
                </div>
                @if (!entry.placeId) {
                  @if (googlePlaces()) {
                    <button
                      matIconButton
                      (click)="lookUpOnGoogle(entry)"
                      [disabled]="busy()"
                      [matTooltip]="'activity.places.google' | transloco"
                      [attr.aria-label]="'activity.places.google' | transloco"
                    >
                      <mat-icon>travel_explore</mat-icon>
                    </button>
                  }
                  <button
                    matButton
                    (click)="name(entry.latitude, entry.longitude, entry.found)"
                  >
                    {{ 'activity.places.name' | transloco }}
                  </button>
                }
                <a
                  matIconButton
                  [href]="mapLink(entry.latitude, entry.longitude)"
                  target="_blank"
                  rel="noopener"
                  [matTooltip]="'activity.places.map' | transloco"
                  [attr.aria-label]="'activity.places.map' | transloco"
                >
                  <mat-icon>map</mat-icon>
                </a>
              } @else {
                <mat-icon>{{ modeIcons[entry.mode] }}</mat-icon>
                <div class="what">
                  <div class="name">
                    {{
                      'activity.places.modes.' + entry.mode
                        | transloco
                          : {km: (entry.meters / 1000 | number: '1.0-1')}
                    }}
                  </div>
                  <div class="when">
                    {{ entry.startedAt | date: 'HH:mm' }}–{{
                      entry.endedAt | date: 'HH:mm'
                    }}
                    ·
                    {{ duration(entry) | pdDuration }}
                  </div>
                </div>
              }
            </div>
          }
        </mat-card-content>
      </mat-card>

      @if (o.frequent.length) {
        <mat-card appearance="outlined">
          <mat-card-header>
            <mat-card-title>{{
              'activity.places.frequent' | transloco
            }}</mat-card-title>
            <mat-card-subtitle>{{
              'activity.places.frequentHint' | transloco
            }}</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content class="padded">
            @for (place of o.frequent; track $index) {
              <div class="entry">
                <mat-icon>{{ place.placeId ? 'bookmark' : 'place' }}</mat-icon>
                <div class="what">
                  <div class="name">{{ label(place) }}</div>
                  <div class="when">
                    {{ place.seconds | pdDuration }} ·
                    {{
                      'activity.places.visits'
                        | transloco: {count: place.visits}
                    }}
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
                  <button
                    matButton
                    (click)="name(place.latitude, place.longitude, place.found)"
                  >
                    {{ 'activity.places.name' | transloco }}
                  </button>
                }
              </div>
            }
          </mat-card-content>
        </mat-card>
      }
    }

    <pd-places-import (imported)="overview.reload()" />
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
      flex-wrap: wrap;
      gap: 4px;
    }
    .day {
      min-width: 12em;
      text-align: center;
      font-weight: 500;
    }
    .map-switch {
      margin-left: auto;
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
      overflow-wrap: anywhere;
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
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /** From the address (the life timeline links a day), else today. */
  protected readonly day = signal(this.initialDay());
  protected readonly isToday = computed(() => this.day() >= todayLocalDate());
  protected readonly overview = this.api.places(() => this.day());
  private readonly settings = this.api.placesSettings();
  protected readonly googlePlaces = computed(
    () => this.settings.value()?.googlePlaces ?? false,
  );
  protected readonly googleMapsKey = computed(
    () => this.settings.value()?.googleMapsKey ?? null,
  );
  protected readonly map = signal(savedMap());
  protected readonly busy = signal(false);
  protected readonly stays = computed(() =>
    (this.overview.value()?.entries ?? []).filter(
      entry => entry.kind === 'stay',
    ),
  );
  protected readonly modeIcons = MODE_ICONS;
  /** OpenStreetMap's and Google's kinds are words of a tag: `fast_food` → "fast food". */
  protected readonly kindLabel = (kind: string) => kind.replace(/_/g, ' ');
  protected readonly mapLink = mapUrl;
  protected readonly duration = (entry: PlacesEntry) => seconds(entry);
  /** The user's name, else the one found on a map, else "a place without a name". */
  protected readonly label = (place: {
    name: string | null;
    found: {name: string} | null;
  }): string =>
    place.name ??
    place.found?.name ??
    this.transloco.translate('activity.places.unnamed');

  protected shift(days: number): void {
    const day = toLocalDate(addDays(parseLocalDate(this.day()), days));
    this.day.set(day);
    void this.router.navigate([], {queryParams: {day}, replaceUrl: true});
  }

  protected pickMap(map: 'osm' | 'google'): void {
    this.map.set(map);
    try {
      localStorage.setItem(MAP_KEY, map);
    } catch {
      // Without storage the choice lasts until the page is left.
    }
  }

  protected async lookUpOnGoogle(point: {
    latitude: number;
    longitude: number;
  }): Promise<void> {
    this.busy.set(true);
    try {
      const found = await firstValueFrom(
        this.api.lookUpOnGoogle({
          latitude: point.latitude,
          longitude: point.longitude,
        }),
      );
      if (!found) {
        this.snackBar.open(
          this.transloco.translate('activity.places.googleNone'),
          'OK',
          {
            duration: 5000,
          },
        );
      }
      this.overview.reload();
    } catch {
      this.snackBar.open(
        this.transloco.translate('activity.places.googleFailed'),
        'OK',
        {
          duration: 6000,
        },
      );
    } finally {
      this.busy.set(false);
    }
  }

  protected async name(
    latitude: number,
    longitude: number,
    found: FoundPlaceName | null,
  ): Promise<void> {
    const name = prompt(
      this.transloco.translate('activity.places.namePrompt'),
      found?.name ?? '',
    )?.trim();
    if (name) {
      await firstValueFrom(
        this.api.addPlace({name, latitude, longitude, radiusM: 150}),
      );
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
