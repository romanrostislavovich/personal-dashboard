import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { TranslocoPipe } from '@jsverse/transloco';
import { WeatherLocation } from '@pd/contracts';
import { debounceTime } from 'rxjs';
import { WeatherApi } from './weather.api';

/** Pause after typing before searching, ms. */
const SEARCH_DEBOUNCE_MS = 300;

/** City search: type a name, pick one of the places found. */
@Component({
  selector: 'pd-location-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatAutocompleteModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    TranslocoPipe,
  ],
  template: `
    <mat-form-field appearance="outline" subscriptSizing="dynamic">
      <mat-icon matPrefix>search</mat-icon>
      <input
        matInput
        [placeholder]="'weather.searchCity' | transloco"
        [value]="query()"
        (input)="query.set($any($event.target).value)"
        [matAutocomplete]="places"
      />
      <mat-autocomplete #places (optionSelected)="choose($event.option.value)">
        @for (place of results.value(); track $index) {
          <mat-option [value]="place">
            {{ place.name }}
            <span class="where">{{ describe(place) }}</span>
          </mat-option>
        }
      </mat-autocomplete>
    </mat-form-field>
  `,
  styles: `
    :host {
      width: min(360px, 100%);
    }
    mat-form-field {
      width: 100%;
    }
    .where {
      margin-left: 6px;
      color: var(--mat-sys-on-surface-variant);
      font-size: 0.85em;
    }
  `,
})
export class LocationPickerComponent {
  readonly chosen = output<WeatherLocation>();

  protected readonly query = signal('');
  private readonly debouncedQuery = toSignal(
    toObservable(this.query).pipe(debounceTime(SEARCH_DEBOUNCE_MS)),
    { initialValue: '' },
  );
  protected readonly results = inject(WeatherApi).places(this.debouncedQuery);

  protected choose(place: WeatherLocation): void {
    this.query.set('');
    this.chosen.emit(place);
  }

  protected describe(place: WeatherLocation): string {
    return [place.region, place.country].filter(Boolean).join(', ');
  }
}
