import { DecimalPipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import { ACTIVITY_READS } from '@pd/client-core';
import { PhoneSignalsDay } from '@pd/contracts';

type Field = Exclude<keyof PhoneSignalsDay, 'day'>;

interface Tile {
  field: Field;
  icon: string;
  /** How the average is shown. */
  as: 'clock' | 'hours' | 'number';
}

const TILES: Tile[] = [
  { field: 'firstUse', icon: 'wb_twilight', as: 'clock' },
  { field: 'lastUse', icon: 'bedtime', as: 'clock' },
  { field: 'restHours', icon: 'hotel', as: 'hours' },
  { field: 'steps', icon: 'directions_walk', as: 'number' },
  { field: 'mediaHours', icon: 'music_note', as: 'hours' },
  { field: 'headphonesHours', icon: 'headphones', as: 'hours' },
  { field: 'carHours', icon: 'directions_car', as: 'hours' },
  { field: 'dndHours', icon: 'do_not_disturb_on', as: 'hours' },
  { field: 'calls', icon: 'call', as: 'number' },
  { field: 'callMinutes', icon: 'timer', as: 'number' },
  { field: 'people', icon: 'group', as: 'number' },
  { field: 'photos', icon: 'photo_camera', as: 'number' },
  { field: 'mobileMegabytes', icon: 'signal_cellular_alt', as: 'number' },
  { field: 'noiseDb', icon: 'graphic_eq', as: 'number' },
  { field: 'daylightHours', icon: 'wb_sunny', as: 'hours' },
];

function hoursOf(clock: string): number {
  const [h, m] = clock.split(':').map(Number);
  return h + m / 60;
}

function clockOf(hours: number): string {
  const minutes = Math.round(hours * 60);
  const h = Math.floor(minutes / 60) % 24;
  return `${String(h).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/**
 * The phone's signals of the period (docs/telemetry.md): the average day — when the phone was
 * first and last used, the rest of the night, steps, what played, headphones and the car, Do Not
 * Disturb, calls, photos, mobile data, the noise and daylight. Each over the days it was told.
 */
@Component({
  selector: 'pd-phone-signals',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, MatCardModule, MatIconModule, TranslocoPipe],
  template: `
    @if (tiles().length) {
      <mat-card appearance="outlined">
        <mat-card-header>
          <mat-card-title>{{ 'activity.phone.signals.title' | transloco }}</mat-card-title>
          <mat-card-subtitle>{{ 'activity.phone.signals.hint' | transloco }}</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content class="tiles">
          @for (tile of tiles(); track tile.field) {
            <div class="tile">
              <mat-icon>{{ tile.icon }}</mat-icon>
              <span class="label">{{ 'activity.phone.signals.' + tile.field | transloco }}</span>
              <span class="value">
                @switch (tile.as) {
                  @case ('clock') {
                    {{ tile.text }}
                  }
                  @case ('hours') {
                    {{ tile.value | number: '1.0-1' }} {{ 'activity.phone.signals.h' | transloco }}
                  }
                  @default {
                    {{ tile.value | number: '1.0-0' }}
                  }
                }
              </span>
              <span class="days">{{
                'activity.phone.signals.days' | transloco: { count: tile.days }
              }}</span>
            </div>
          }
        </mat-card-content>
      </mat-card>
    }
  `,
  styles: `
    .tiles {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      gap: 12px;
      padding-top: 12px;
    }
    .tile {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 10px 12px;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 12px;
    }
    .label,
    .days {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-label-medium);
    }
    .value {
      font: 700 1.3rem / 1.2 var(--pd-font-heading);
    }
  `,
})
export class PhoneSignalsComponent {
  readonly period = input.required<{ from: string; to: string }>();

  private readonly days = httpResource<PhoneSignalsDay[]>(
    () => ACTIVITY_READS.phoneSignals(this.period()),
    { defaultValue: [] },
  );

  /** Each number's average over the days it was told; a number never told is left out. */
  protected readonly tiles = computed(() =>
    TILES.flatMap((tile) => {
      const told = this.days
        .value()
        .map((day) => day[tile.field])
        .filter((value): value is number | string => value !== null);
      if (!told.length) {
        return [];
      }
      const numbers = told.map((value) => (typeof value === 'string' ? hoursOf(value) : value));
      const average = numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
      return [{ ...tile, value: average, text: clockOf(average), days: told.length }];
    }),
  );
}
