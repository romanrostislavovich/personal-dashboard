import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {MatButtonModule} from '@angular/material/button';
import {MatCardModule} from '@angular/material/card';
import {MatIconModule} from '@angular/material/icon';
import {RouterLink} from '@angular/router';
import {TranslocoPipe, TranslocoService} from '@jsverse/transloco';
import {LifeApi} from '../life.api';
import {hourRanges, weekdayNames} from './hours-format';

/**
 * The productive window: the hours each weekday when coding, deep work and tasks done are
 * highest for the user, over the last 90 days, and how sure it is. On Home (`compact`) today's
 * only.
 */
@Component({
  selector: 'pd-window-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    RouterLink,
    TranslocoPipe,
  ],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        @if (!compact()) {
          <mat-icon mat-card-avatar>wb_twilight</mat-icon>
        }
        <mat-card-title>{{
          'life.hourly.window.title' | transloco
        }}</mat-card-title>
        @if (!compact()) {
          <mat-card-subtitle>{{
            'life.hourly.window.hint' | transloco
          }}</mat-card-subtitle>
        }
      </mat-card-header>
      <mat-card-content>
        @if (data.error()) {
          <p class="muted">{{ 'life.hourly.failed' | transloco }}</p>
        } @else if (data.hasValue()) {
          @if (!data.value().metrics.length) {
            <p class="muted">{{ 'life.hourly.window.none' | transloco }}</p>
          } @else if (today(); as day) {
            <p class="today">
              @if (day.windows.length) {
                {{
                  'life.hourly.window.today'
                    | transloco: {hours: ranges(day.windows)}
                }}
              } @else {
                {{ 'life.hourly.window.noneToday' | transloco }}
              }
            </p>
            <p class="muted">
              {{ 'life.hourly.window.sure.' + day.sure | transloco }}
              · {{ 'life.hourly.window.days' | transloco: {days: day.days} }}
            </p>
            @if (!compact()) {
              <ul class="week">
                @for (one of data.value().week; track one.weekday) {
                  <li [class.current]="one.weekday === data.value().weekday">
                    <span>{{ weekdays()[one.weekday] }}</span>
                    <span>{{
                      one.windows.length ? ranges(one.windows) : '—'
                    }}</span>
                  </li>
                }
              </ul>
            }
          }
        }
      </mat-card-content>
      @if (compact()) {
        <mat-card-actions align="end">
          <a matButton routerLink="/life/links">{{
            'life.hourly.window.open' | transloco
          }}</a>
        </mat-card-actions>
      }
    </mat-card>
  `,
  styles: `
    :host {
      display: block;
    }
    .today {
      margin: 8px 0 0;
      font: var(--mat-sys-title-medium);
    }
    .week {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: 4px 16px;
      margin: 12px 0 0;
      padding: 0;
      list-style: none;
    }
    .week li {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      padding: 4px 0;
      border-bottom: 1px solid var(--pd-border);
      font-variant-numeric: tabular-nums;
    }
    .current {
      font-weight: 600;
    }
    .muted {
      margin: 4px 0 0;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class WindowCardComponent {
  private readonly api = inject(LifeApi);
  private readonly transloco = inject(TranslocoService);

  /** On Home: today's window only. */
  readonly compact = input(false);

  protected readonly data = this.api.productiveWindow();
  protected readonly today = computed(() =>
    this.data.hasValue()
      ? this.data.value().week[this.data.value().weekday]
      : null,
  );
  private readonly language = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });
  protected readonly weekdays = computed(() => weekdayNames(this.language()));

  protected ranges(windows: {from: number; to: number}[]): string {
    return hourRanges(windows);
  }
}
