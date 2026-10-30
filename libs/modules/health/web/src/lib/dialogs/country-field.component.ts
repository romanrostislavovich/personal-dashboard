import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  inject,
  signal,
} from '@angular/core';
import {ControlValueAccessor, NG_VALUE_ACCESSOR} from '@angular/forms';
import {MatAutocompleteModule} from '@angular/material/autocomplete';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {TranslocoPipe, TranslocoService} from '@jsverse/transloco';
import {HEALTH_COUNTRIES} from '@pd/contracts';
import {countryName} from '../health-labels';

/**
 * A country as its two-letter code: Ukraine, Belarus and Poland are offered, any other code may
 * be typed (`DE`). The name in the user's language is shown under the field.
 */
@Component({
  selector: 'pd-health-country-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatAutocompleteModule,
    MatFormFieldModule,
    MatInputModule,
    TranslocoPipe,
  ],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CountryFieldComponent),
      multi: true,
    },
  ],
  template: `
    <mat-form-field>
      <mat-label>{{ 'health.country' | transloco }}</mat-label>
      <input
        matInput
        maxlength="2"
        [value]="value()"
        [disabled]="disabled()"
        [matAutocomplete]="countries"
        (input)="change($any($event.target).value)"
        (blur)="touched()"
      />
      <mat-autocomplete
        #countries="matAutocomplete"
        (optionSelected)="change($event.option.value)"
      >
        @for (code of codes; track code) {
          <mat-option [value]="code">{{ code }} · {{ name(code) }}</mat-option>
        }
      </mat-autocomplete>
      <mat-hint>{{ shown() }}</mat-hint>
    </mat-form-field>
  `,
  styles: `
    mat-form-field {
      width: 100%;
    }
  `,
})
export class CountryFieldComponent implements ControlValueAccessor {
  private readonly transloco = inject(TranslocoService);

  protected readonly codes = HEALTH_COUNTRIES;
  protected readonly value = signal('');
  protected readonly disabled = signal(false);
  protected readonly shown = computed(() =>
    /^[A-Z]{2}$/.test(this.value()) ? this.name(this.value()) : '',
  );

  private onChange: (value: string) => void = () => undefined;
  protected touched: () => void = () => undefined;

  protected name(code: string): string {
    return countryName(code, this.transloco.getActiveLang());
  }

  protected change(value: string): void {
    const code = value.trim().toUpperCase();
    this.value.set(code);
    this.onChange(code);
  }

  writeValue(value: string | null): void {
    this.value.set(value ?? '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.touched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
  }
}
