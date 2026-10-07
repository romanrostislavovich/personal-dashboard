import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  LOCALE_ID,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ActivityFocusSession } from '@pd/contracts';
import { Bar, BarChartComponent, DurationPipe, Share, ShareListComponent } from '@pd/web-core';
import { firstValueFrom } from 'rxjs';
import { lastDays } from '../activity-period';
import { ActivityApi } from '../activity.api';
import { FocusControlComponent } from './focus-control.component';

const PERIODS = [7, 30, 90, 365] as const;
const DAILY_BARS_LIMIT = 31;

/** Focus sessions (Pomodoro): the timer of this computer, the totals, the streak, the list. */
@Component({
  selector: 'pd-activity-focus-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatIconModule,
    MatTooltipModule,
    TranslocoPipe,
    BarChartComponent,
    DurationPipe,
    ShareListComponent,
    FocusControlComponent,
  ],
  template: `
    <pd-activity-focus-control
      [focusMinutes]="settings.value()?.focusMinutes ?? 25"
      (changed)="stats.reload()"
    />

    <header class="toolbar">
      <mat-button-toggle-group
        hideSingleSelectionIndicator
        [value]="days()"
        [attr.aria-label]="'activity.period' | transloco"
        (change)="days.set($event.value)"
      >
        @for (period of periods; track period) {
          <mat-button-toggle [value]="period">
            {{ 'activity.periods.' + period | transloco }}
          </mat-button-toggle>
        }
      </mat-button-toggle-group>
    </header>

    @if (stats.value(); as s) {
      <mat-card appearance="outlined">
        <mat-card-content class="stats">
          <div class="stat">
            <span class="label">{{ 'activity.focus.total' | transloco }}</span>
            <span class="value">{{ s.focusSeconds | pdDuration }}</span>
          </div>
          <div class="stat">
            <span class="label">{{ 'activity.focus.completed' | transloco }}</span>
            <span class="value">{{ s.completed }}</span>
          </div>
          <div class="stat">
            <span class="label">{{ 'activity.focus.streak' | transloco }}</span>
            <span class="value">{{
              'activity.focus.days' | transloco: { count: s.streak.current }
            }}</span>
            <span class="sub">
              {{ 'activity.focus.longest' | transloco: { count: s.streak.longest } }}
            </span>
          </div>
          <div class="stat">
            <span class="label">{{ 'activity.focus.distracted' | transloco }}</span>
            <span class="value">{{ s.distractedSeconds | pdDuration }}</span>
            @if (s.focusSeconds) {
              <span class="sub">
                {{ 'activity.focus.distractedShare' | transloco: { share: distractedShare() } }}
              </span>
            }
          </div>
        </mat-card-content>
      </mat-card>

      @if (s.sessions.length) {
        <mat-card appearance="outlined">
          <mat-card-header>
            <mat-card-title>{{ 'activity.focus.chart' | transloco }}</mat-card-title>
          </mat-card-header>
          <mat-card-content class="padded">
            <pd-bar-chart [bars]="bars()" [label]="'activity.focus.chart' | transloco" />
          </mat-card-content>
        </mat-card>

        <div class="columns">
          @if (projects().length) {
            <mat-card appearance="outlined">
              <mat-card-header>
                <mat-card-title>{{ 'activity.byProject' | transloco }}</mat-card-title>
              </mat-card-header>
              <mat-card-content class="padded">
                <pd-share-list [items]="projects()" />
              </mat-card-content>
            </mat-card>
          }

          @if (music.value(); as m) {
            @if (m.withMusic.sessions) {
              <mat-card appearance="outlined">
                <mat-card-header>
                  <mat-card-title>{{ 'activity.focus.music.title' | transloco }}</mat-card-title>
                  <mat-card-subtitle>
                    {{ 'activity.focus.music.hint' | transloco }}
                  </mat-card-subtitle>
                </mat-card-header>
                <mat-card-content class="padded">
                  @for (group of [m.withMusic, m.withoutMusic]; track $index) {
                    <p class="music-group">
                      <b>{{
                        ($index === 0
                          ? 'activity.focus.music.with'
                          : 'activity.focus.music.without'
                        ) | transloco: { count: group.sessions }
                      }}</b>
                      <span class="hint">
                        {{
                          'activity.focus.music.result'
                            | transloco
                              : {
                                  completed: group.completedPercent,
                                  distracted: group.distractedPercent,
                                }
                        }}
                      </span>
                    </p>
                  }
                  <p class="hint">
                    {{ 'activity.focus.music.artists' | transloco }}
                    @for (artist of m.artists; track artist.artist) {
                      {{ artist.artist }} ({{ artist.sessions }}){{ $last ? '' : ', ' }}
                    }
                  </p>
                  @for (item of m.byProject; track item.project) {
                    <p class="hint">
                      <b>{{ item.project ?? ('activity.focus.noProject' | transloco) }}:</b>
                      {{ item.artists.join(', ') }}
                    </p>
                  }
                </mat-card-content>
              </mat-card>
            }
          }

          <mat-card appearance="outlined">
            <mat-card-header>
              <mat-card-title>{{ 'activity.focus.sessions' | transloco }}</mat-card-title>
            </mat-card-header>
            <mat-card-content>
              <ul class="sessions">
                @for (session of s.sessions; track session.id) {
                  <li>
                    <mat-icon inline [class.stopped]="!session.completed">
                      {{ session.completed ? 'check_circle' : 'stop_circle' }}
                    </mat-icon>
                    <span class="when">
                      {{ session.startedAt | date: 'd MMM, HH:mm' }}
                      <span class="hint">{{ session.focusSeconds | pdDuration }}</span>
                    </span>
                    <span class="what">
                      {{ session.projectName ?? '' }}
                      @if (session.note) {
                        <span class="hint">{{ session.note }}</span>
                      }
                      @if (distractions(session); as d) {
                        <span class="hint">{{ d }}</span>
                      }
                    </span>
                    <button
                      matIconButton
                      [matTooltip]="'core.actions.delete' | transloco"
                      [attr.aria-label]="'core.actions.delete' | transloco"
                      (click)="remove(session.id)"
                    >
                      <mat-icon>delete</mat-icon>
                    </button>
                  </li>
                }
              </ul>
            </mat-card-content>
          </mat-card>
        </div>
      } @else {
        <p class="hint">{{ 'activity.focus.empty' | transloco }}</p>
      }
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .hint {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 16px;
      padding-top: 16px;
    }
    .stat {
      display: flex;
      flex-direction: column;
    }
    .label {
      font: var(--mat-sys-label-medium);
      color: var(--mat-sys-on-surface-variant);
    }
    .value {
      font: var(--mat-sys-headline-small);
    }
    .sub {
      font: var(--mat-sys-label-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .padded {
      padding-top: 12px;
    }
    .music-group {
      display: flex;
      flex-direction: column;
      margin: 0 0 8px;
    }
    .columns {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(340px, 100%), 1fr));
      align-items: start;
      gap: 16px;
    }
    .sessions {
      margin: 8px 0 0;
      padding: 0;
      list-style: none;
    }
    .sessions li {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 4px 0;
      border-top: 1px solid var(--mat-sys-outline-variant);
    }
    .sessions li:first-child {
      border-top: 0;
    }
    .sessions mat-icon {
      color: var(--pd-success);
    }
    .sessions mat-icon.stopped {
      color: var(--mat-sys-on-surface-variant);
    }
    .when,
    .what {
      display: flex;
      flex-direction: column;
    }
    .when {
      width: 120px;
    }
    .what {
      flex: 1;
      min-width: 0;
      overflow-wrap: anywhere;
    }
  `,
})
export class FocusPage {
  private readonly api = inject(ActivityApi);
  private readonly transloco = inject(TranslocoService);
  private readonly datePipe = new DatePipe(inject(LOCALE_ID));
  private readonly duration = new DurationPipe();

  protected readonly periods = PERIODS;
  protected readonly days = signal<(typeof PERIODS)[number]>(30);
  protected readonly settings = this.api.settings();
  protected readonly stats = this.api.focus(() => lastDays(this.days()));
  /** What played during the sessions: the Music section tells it through the core. */
  protected readonly music = this.api.focusMusic(() => lastDays(this.days()));

  protected readonly distractedShare = computed(() => {
    const s = this.stats.value();
    return s?.focusSeconds ? Math.round((s.distractedSeconds / s.focusSeconds) * 100) : 0;
  });

  protected readonly bars = computed<Bar[]>(() => {
    const days = this.stats.value()?.days ?? [];
    if (days.length <= DAILY_BARS_LIMIT) {
      const labelEvery = days.length <= 7 ? 1 : 5;
      return days.map(({ day, seconds }, index) => ({
        label: index % labelEvery === 0 ? (this.datePipe.transform(day, 'd MMM') ?? '') : '',
        value: seconds,
        title: `${this.datePipe.transform(day, 'EEEE, d MMMM')} — ${this.duration.transform(seconds)}`,
      }));
    }
    const months = new Map<string, number>();
    for (const { day, seconds } of days) {
      months.set(day.slice(0, 7), (months.get(day.slice(0, 7)) ?? 0) + seconds);
    }
    return [...months].map(([month, seconds]) => ({
      label: this.datePipe.transform(`${month}-01`, 'LLL') ?? '',
      value: seconds,
      title: `${this.datePipe.transform(`${month}-01`, 'LLLL y')} — ${this.duration.transform(seconds)}`,
    }));
  });

  protected readonly projects = computed<Share[]>(() =>
    (this.stats.value()?.projects ?? []).map(({ name, seconds }) => ({
      name: name ?? this.transloco.translate('activity.focus.noProject'),
      value: seconds,
      text: this.duration.transform(seconds),
    })),
  );

  /** "Telegram 4 min, Dota 2 2 min" — what took attention away. */
  protected distractions(session: ActivityFocusSession): string {
    return session.distractions
      .filter((item) => item.seconds >= 30)
      .slice(0, 3)
      .map((item) => `${item.name} ${this.duration.transform(item.seconds)}`)
      .join(', ');
  }

  protected async remove(id: string): Promise<void> {
    await firstValueFrom(this.api.removeFocus(id));
    this.stats.reload();
  }
}
