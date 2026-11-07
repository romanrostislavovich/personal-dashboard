import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatCardModule} from '@angular/material/card';
import {MatIconModule} from '@angular/material/icon';
import {MatSelectModule} from '@angular/material/select';
import {RouterLink} from '@angular/router';
import {TranslocoPipe, TranslocoService} from '@jsverse/transloco';
import {DEFAULT_FORECAST_TARGETS, MAX_FORECAST_TARGETS} from '@pd/contracts';
import {LifeApi} from '../life.api';
import {forecastGroups} from './forecast-groups';
import {ForecastRowComponent} from './forecast-row.component';

/**
 * Forecasts of the numbers: the bedtime, deep work, tasks done, the mood and the numbers the
 * user chose, each by a model of their own days, with what drove it and how close the kept
 * ones came. One that does not beat the plain guess is shown grey here and never on Home (the
 * widget, `compact`).
 */
@Component({
  selector: 'pd-forecasts-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ForecastRowComponent,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatSelectModule,
    RouterLink,
    TranslocoPipe,
  ],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        @if (!compact()) {
          <mat-icon mat-card-avatar>online_prediction</mat-icon>
        }
        <mat-card-title>{{
          'life.forecasts.title' | transloco
        }}</mat-card-title>
        @if (!compact()) {
          <mat-card-subtitle>{{
            'life.forecasts.hint' | transloco
          }}</mat-card-subtitle>
        }
      </mat-card-header>
      <mat-card-content>
        @if (data.error()) {
          <p class="muted">{{ 'life.forecasts.failed' | transloco }}</p>
        } @else if (data.hasValue()) {
          @for (group of groups(); track group.day) {
            <h3 class="day">
              {{
                (group.made === 'morning'
                  ? 'life.forecasts.today'
                  : 'life.forecasts.tomorrow'
                ) | transloco
              }}
            </h3>
            <div class="forecasts" role="list">
              @for (item of group.items; track item.forecast.key) {
                <pd-forecast-row
                  role="listitem"
                  [item]="item"
                  [compact]="compact()"
                />
              }
            </div>
          } @empty {
            <p class="muted">
              {{
                (data.value().forecasts.length
                  ? 'life.forecasts.noneTrusted'
                  : 'life.forecasts.none'
                ) | transloco
              }}
            </p>
          }
          @if (!compact() && options().length) {
            <mat-form-field class="targets" subscriptSizing="dynamic">
              <mat-label>{{ 'life.forecasts.choose' | transloco }}</mat-label>
              <mat-select
                multiple
                [value]="chosen()"
                [disabled]="saving()"
                (selectionChange)="draft.set($event.value)"
                (openedChange)="$event || save()"
              >
                @for (option of options(); track option.key) {
                  <mat-option
                    [value]="option.key"
                    [disabled]="
                      chosen().length >= max && !chosen().includes(option.key)
                    "
                    >{{ option.name }}</mat-option
                  >
                }
              </mat-select>
              <mat-hint>{{ 'life.forecasts.max' | transloco: {max} }}</mat-hint>
            </mat-form-field>
            @if (saveFailed()) {
              <p class="error" role="alert">
                {{ 'life.forecasts.saveFailed' | transloco }}
              </p>
            }
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
    .forecasts {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin: 8px 0 0;
    }
    .targets {
      width: 100%;
      margin-top: 16px;
    }
    .muted {
      margin: 0;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .error {
      margin: 4px 0 0;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-error);
    }
  `,
})
export class ForecastsCardComponent {
  private readonly api = inject(LifeApi);
  private readonly transloco = inject(TranslocoService);

  /** The Home widget: the trusted forecasts only, no explanations. */
  readonly compact = input(false);

  protected readonly max = MAX_FORECAST_TARGETS;
  protected readonly data = this.api.forecasts();
  /** The choice while the list is open: saved once, when it closes. */
  protected readonly draft = signal<string[] | null>(null);
  protected readonly saving = signal(false);
  protected readonly saveFailed = signal(false);

  protected readonly groups = computed(() =>
    this.data.hasValue()
      ? forecastGroups(this.data.value(), this.compact())
      : [],
  );

  /** The chosen targets beyond the default ones, as kept. */
  private readonly kept = computed(() =>
    this.data.hasValue()
      ? this.data
          .value()
          .targets.filter(
            key =>
              !(DEFAULT_FORECAST_TARGETS as readonly string[]).includes(key),
          )
      : [],
  );
  /** … or as being chosen. */
  protected readonly chosen = computed(() => this.draft() ?? this.kept());

  /** What may be chosen — the chosen ones and the other main numbers — by name, so it stays put. */
  protected readonly options = computed(() => {
    if (!this.data.hasValue()) {
      return [];
    }
    const {forecasts, candidates} = this.data.value();
    const kept = this.kept();
    const current = forecasts.filter(
      (one, index, all) =>
        kept.includes(one.key) &&
        all.findIndex(other => other.key === one.key) === index,
    );
    return [...current, ...candidates]
      .map(one => ({
        key: one.key,
        name: one.label ?? this.transloco.translate<string>(one.labelKey),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  /** Saves the choice when the list closes, if it changed; a failure goes back to the kept one. */
  protected save(): void {
    const draft = this.draft();
    if (!draft || sameSet(draft, this.kept())) {
      this.draft.set(null);
      return;
    }
    this.saving.set(true);
    this.saveFailed.set(false);
    this.api.setForecastTargets(draft).subscribe({
      // The draft stays shown until the reload brings the same choice back.
      next: () => {
        this.saving.set(false);
        this.data.reload();
      },
      error: () => {
        this.saving.set(false);
        this.draft.set(null);
        this.saveFailed.set(true);
      },
    });
  }
}

function sameSet(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every(key => b.includes(key));
}
