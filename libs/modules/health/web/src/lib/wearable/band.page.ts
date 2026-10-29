import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { EmptyStateComponent } from '@pd/web-core';
import { HealthApi } from '../health.api';
import { today } from './band-format';
import { BandDayComponent } from './band-day.component';
import { BandMindComponent } from './band-mind.component';
import { BandTrendsComponent } from './band-trends.component';

const VIEWS = ['day', 'trends', 'mind'] as const;
type View = (typeof VIEWS)[number];

/**
 * Health → Band: the band's data from the phone's Health Connect and the Google Health API —
 * a day by hours with its night, the trends of a period, and the mind (mindfulness, the body's
 * reactions, resilience). The view and the day are in the address (`?view=day&day=…`): a
 * reaction's notification opens its day.
 */
@Component({
  selector: 'pd-band-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatButtonToggleModule,
    RouterLink,
    TranslocoPipe,
    EmptyStateComponent,
    BandDayComponent,
    BandMindComponent,
    BandTrendsComponent,
  ],
  template: `
    @if (status.value(); as s) {
      @if (!s.connected && !s.firstDay) {
        <pd-empty-state
          icon="watch"
          [title]="'health.band.empty.title' | transloco"
          [text]="'health.band.empty.text' | transloco"
        />
        <p class="center">
          <a matButton="filled" routerLink="/settings" [queryParams]="{ tab: 'integrations' }">
            {{ 'health.band.empty.connect' | transloco }}
          </a>
        </p>
      } @else {
        <mat-button-toggle-group
          [value]="view()"
          (change)="go({ view: $event.value })"
          [attr.aria-label]="'health.band.views.label' | transloco"
        >
          @for (v of views; track v) {
            <mat-button-toggle [value]="v">{{
              'health.band.views.' + v | transloco
            }}</mat-button-toggle>
          }
        </mat-button-toggle-group>
        @switch (view()) {
          @case ('day') {
            <pd-band-day [day]="day()" (dayChange)="go({ view: 'day', day: $event })" />
          }
          @case ('trends') {
            <pd-band-trends />
          }
          @case ('mind') {
            <pd-band-mind />
          }
        }
      }
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .center {
      text-align: center;
    }
    mat-button-toggle-group {
      align-self: flex-start;
    }
  `,
})
export class BandPage {
  private readonly api = inject(HealthApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly views = VIEWS;
  protected readonly status = this.api.wearable();

  private readonly query = toSignal(this.route.queryParamMap);
  protected readonly view = computed((): View => {
    const view = this.query()?.get('view') as View | null;
    return view && VIEWS.includes(view) ? view : 'day';
  });
  protected readonly day = computed(() => {
    const day = this.query()?.get('day');
    return day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : today();
  });

  protected go(params: { view: View; day?: string }): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        view: params.view,
        day: params.view === 'day' ? (params.day ?? this.day()) : null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
