import {httpResource} from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatCardModule} from '@angular/material/card';
import {RouterLink} from '@angular/router';
import {TranslocoPipe, TranslocoService} from '@jsverse/transloco';
import {CORE_READS} from '@pd/client-core';
import {Unusual, UnusualNumber} from '@pd/contracts';
import {formatValue, moduleColor} from './links-format';

/** On the Home widget: the rarest few of today and yesterday together. */
const COMPACT = 3;

/**
 * "Unusual": today's and yesterday's numbers further from their usual level than on 9 of 10
 * days. Calm on purpose — an arrow and "more than on 9 of 10 days", no colours for good or bad.
 * Today is not over: only what is already above usual. Links shows both days; the Home widget
 * (`compact`) the rarest few.
 */
@Component({
  selector: 'pd-unusual-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatCardModule, RouterLink, TranslocoPipe],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-card-title>{{
          'life.links.unusual.title' | transloco
        }}</mat-card-title>
        @if (!compact()) {
          <mat-card-subtitle>{{
            'life.links.unusual.hint' | transloco
          }}</mat-card-subtitle>
        }
      </mat-card-header>
      <mat-card-content>
        @if (data.error()) {
          <p class="muted">{{ 'life.links.unusual.failed' | transloco }}</p>
        } @else if (data.hasValue()) {
          @for (day of days(); track day.day) {
            @if (!compact()) {
              <h3 class="day">
                {{
                  (day.complete
                    ? 'life.links.unusual.yesterday'
                    : 'life.links.unusual.today'
                  ) | transloco
                }}
              </h3>
            }
            @if (day.numbers.length) {
              <ul class="numbers">
                @for (number of day.numbers; track number.key) {
                  <li>
                    <span
                      class="dot"
                      [style.background]="color(number)"
                      aria-hidden="true"
                    ></span>
                    <span class="name">{{ name(number) }}</span>
                    <span class="value">
                      {{ number.direction === 'up' ? '↑' : '↓' }}
                      {{ value(number, number.value) }}
                    </span>
                    <span class="muted line">
                      {{
                        (number.direction === 'up'
                          ? 'life.links.unusual.up'
                          : 'life.links.unusual.down'
                        ) | transloco: {of: ofTen(number)}
                      }}
                      ·
                      {{
                        'life.links.unusual.usual'
                          | transloco: {value: value(number, number.usual)}
                      }}
                      @if (number.baseline === 'kind' && !compact()) {
                        · {{ 'life.links.unusual.kind' | transloco }}
                      }
                    </span>
                  </li>
                }
              </ul>
            } @else if (!compact()) {
              <p class="muted">
                {{
                  (day.complete
                    ? 'life.links.unusual.evenYesterday'
                    : 'life.links.unusual.evenToday'
                  ) | transloco
                }}
              </p>
            }
          }
          @if (compact() && !shownCount()) {
            <p class="muted">{{ 'life.links.unusual.even' | transloco }}</p>
          }
        }
      </mat-card-content>
      @if (compact()) {
        <mat-card-actions align="end">
          <a matButton routerLink="/life/links">{{
            'life.links.unusual.open' | transloco
          }}</a>
        </mat-card-actions>
      }
    </mat-card>
  `,
  styles: `
    :host {
      display: block;
    }
    .day {
      margin: 12px 0 4px;
      font: var(--mat-sys-title-small);
    }
    .numbers {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin: 8px 0 0;
      padding: 0;
      list-style: none;
    }
    li {
      display: grid;
      grid-template-columns: 10px minmax(0, 1fr) auto;
      gap: 2px 8px;
      align-items: baseline;
    }
    .dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
    }
    .name {
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .value {
      font: var(--mat-sys-title-small);
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .line {
      grid-column: 2 / -1;
    }
    .muted {
      margin: 0;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class UnusualCardComponent {
  private readonly transloco = inject(TranslocoService);

  /** The Home widget's few, both days in one list. */
  readonly compact = input(false);

  protected readonly data = httpResource<Unusual>(() => CORE_READS.unusual());

  protected readonly days = computed(() => {
    const days = this.data.hasValue() ? this.data.value().days : [];
    if (!this.compact()) {
      return days;
    }
    // The widget: the rarest of both days, today's first among equals.
    const rarest = days
      .flatMap(day => day.numbers)
      .sort((a, b) => b.beyond - a.beyond)
      .slice(0, COMPACT);
    return [{day: 'both', complete: true, numbers: rarest}];
  });
  protected readonly shownCount = computed(() =>
    this.days().reduce((sum, day) => sum + day.numbers.length, 0),
  );

  protected name(number: UnusualNumber): string {
    return number.label ?? this.transloco.translate(number.labelKey);
  }

  protected color(number: UnusualNumber): string {
    return moduleColor(number.module);
  }

  /** "More than on 9 of 10 days": `beyond` as tenths, never 10 of 10 for less than all. */
  protected ofTen(number: UnusualNumber): number {
    return number.beyond >= 1
      ? 10
      : Math.min(9, Math.floor(number.beyond * 10));
  }

  protected value(number: UnusualNumber, value: number): string {
    return formatValue(number, value, this.transloco.getActiveLang(), hours =>
      this.transloco.translate('life.hours', {value: hours}),
    );
  }
}
