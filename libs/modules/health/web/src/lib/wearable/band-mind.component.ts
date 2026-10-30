import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatCardModule} from '@angular/material/card';
import {MatDialog} from '@angular/material/dialog';
import {MatIconModule} from '@angular/material/icon';
import {TranslocoPipe, TranslocoService} from '@jsverse/transloco';
import {Bar, BarChartComponent, SparklineComponent} from '@pd/web-core';
import {HealthApi} from '../health.api';
import {addDays, corridor, today} from './band-format';
import {BandReactionsComponent} from './band-reactions.component';
import {BreathingDialog} from './breathing.dialog';

/** Resilience is read against the owner's own usual range of this many days. */
const RESILIENCE_DAYS = 28;

/**
 * Health → Band → Mind (like the band app's "mental health"): mindfulness this week with a
 * breathing session to start, the body's reactions of today with what they were, and resilience
 * against the owner's own usual range.
 */
@Component({
  selector: 'pd-band-mind',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    TranslocoPipe,
    BarChartComponent,
    SparklineComponent,
    BandReactionsComponent,
  ],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-card-title>{{
          'health.band.mind.mindfulness' | transloco
        }}</mat-card-title>
        <mat-card-subtitle>
          {{ 'health.band.mind.thisWeek' | transloco: {count: weekMinutes()} }}
        </mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        <pd-bar-chart
          [bars]="mindfulBars()"
          [label]="'health.band.mind.mindfulness' | transloco"
        />
      </mat-card-content>
      <mat-card-actions>
        <button matButton="tonal" (click)="breathe()">
          <mat-icon>air</mat-icon>
          {{ 'health.band.breathing.title' | transloco }}
        </button>
      </mat-card-actions>
    </mat-card>

    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-card-title>{{
          'health.band.reactions.title' | transloco
        }}</mat-card-title>
        <mat-card-subtitle>
          {{
            'health.band.mind.today'
              | transloco: {count: todayDetail.value()?.reactions?.length ?? 0}
          }}
        </mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        <pd-band-reactions
          [reactions]="todayDetail.value()?.reactions ?? []"
          (changed)="todayDetail.reload()"
        />
      </mat-card-content>
    </mat-card>

    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-card-title>{{
          'health.band.fields.resilience' | transloco
        }}</mat-card-title>
        <mat-card-subtitle>
          @if (resilienceToday() !== null) {
            {{
              'health.band.mind.resilienceToday'
                | transloco: {value: resilienceToday()}
            }}
          } @else {
            {{ 'health.band.mind.noResilience' | transloco }}
          }
          @if (usual(); as u) {
            · {{ 'health.band.mind.usual' | transloco: u }}
          }
        </mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        @if (resilienceLine().length > 1) {
          <pd-sparkline
            [points]="resilienceLine()"
            [min]="0"
            [max]="100"
            [showAxis]="true"
          />
        }
        <p class="hint">{{ 'health.band.mind.resilienceHint' | transloco }}</p>
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .hint {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class BandMindComponent {
  private readonly api = inject(HealthApi);
  private readonly dialog = inject(MatDialog);
  private readonly transloco = inject(TranslocoService);

  private readonly todayDay = today();
  protected readonly todayDetail = this.api.bandDay(
    computed(() => ({day: this.todayDay})),
  );
  private readonly days = this.api.wearableDays(
    computed(() => ({
      from: addDays(this.todayDay, -RESILIENCE_DAYS + 1),
      to: this.todayDay,
    })),
  );

  private readonly week = computed(() =>
    this.days.value().filter(d => d.day > addDays(this.todayDay, -7)),
  );

  protected readonly weekMinutes = computed(() =>
    this.week().reduce((sum, day) => sum + (day.mindfulnessMinutes ?? 0), 0),
  );

  protected readonly mindfulBars = computed((): Bar[] => {
    const byDay = new Map(
      this.week().map(d => [d.day, d.mindfulnessMinutes ?? 0]),
    );
    return Array.from({length: 7}, (_, i) => {
      const day = addDays(this.todayDay, i - 6);
      const minutes = byDay.get(day) ?? 0;
      return {
        label: new Date(`${day}T12:00:00`).toLocaleDateString(
          this.transloco.getActiveLang(),
          {
            weekday: 'short',
          },
        ),
        value: minutes,
        title: `${day} — ${minutes}`,
      };
    });
  });

  protected readonly resilienceLine = computed(() =>
    this.days
      .value()
      .flatMap(d =>
        d.resilience === null ? [] : [{at: d.day, value: d.resilience}],
      ),
  );

  protected readonly resilienceToday = computed(
    () =>
      this.days.value().find(d => d.day === this.todayDay)?.resilience ?? null,
  );

  protected readonly usual = computed(() =>
    corridor(this.resilienceLine().map(p => p.value)),
  );

  protected breathe(): void {
    this.dialog
      .open(BreathingDialog, {width: '420px'})
      .afterClosed()
      .subscribe(saved => {
        if (saved) {
          this.days.reload();
        }
      });
  }
}
