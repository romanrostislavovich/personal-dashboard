import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe } from '@jsverse/transloco';
import { ActivityLimitInput, ActivitySettingsUpdate } from '@pd/contracts';
import { DurationPipe } from '@pd/web-core';
import { firstValueFrom } from 'rxjs';
import { ActivityApi } from '../activity.api';

const BREAK_MINUTES = [0, 30, 45, 50, 60, 90, 120];
const SUMMARY_TIMES = ['18:00', '19:00', '20:00', '21:00', '22:00', '23:00'];
const GAME_LIMITS = [0, 30, 60, 90, 120, 180, 240, 300, 360];
const TOTAL_LIMITS = [0, 240, 360, 480, 600, 720, 840];
const APP_LIMITS = [15, 30, 45, 60, 90, 120, 180, 240];
const FOCUS = {
  focusMinutes: [15, 20, 25, 30, 40, 45, 50, 60, 90],
  shortBreakMinutes: [3, 5, 10, 15],
  longBreakMinutes: [10, 15, 20, 30],
  roundsBeforeLongBreak: [2, 3, 4, 5, 6],
} as const;

/** Breaks, daily limits and the focus timer: what the desktop app follows on every computer. */
@Component({
  selector: 'pd-activity-wellbeing-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    MatTooltipModule,
    TranslocoPipe,
    DurationPipe,
  ],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-icon mat-card-avatar>self_improvement</mat-icon>
        <mat-card-title>{{ 'activity.wellbeing.title' | transloco }}</mat-card-title>
      </mat-card-header>
      <mat-card-content>
        <p class="hint">{{ 'activity.wellbeing.hint' | transloco }}</p>
        @if (settings.value(); as current) {
          <div class="row">
            <mat-form-field subscriptSizing="dynamic">
              <mat-label>{{ 'activity.wellbeing.break' | transloco }}</mat-label>
              <mat-select
                [value]="current.breakMinutes"
                (valueChange)="save({ breakMinutes: $event })"
              >
                @for (minutes of breakOptions; track minutes) {
                  <mat-option [value]="minutes">
                    {{
                      minutes ? (minutes * 60 | pdDuration) : ('activity.wellbeing.off' | transloco)
                    }}
                  </mat-option>
                }
              </mat-select>
            </mat-form-field>
            <mat-form-field subscriptSizing="dynamic">
              <mat-label>{{ 'activity.wellbeing.summary' | transloco }}</mat-label>
              <mat-select
                [value]="current.summaryTime"
                (valueChange)="save({ summaryTime: $event })"
              >
                <mat-option [value]="null">{{ 'activity.wellbeing.off' | transloco }}</mat-option>
                @for (time of summaryTimes; track time) {
                  <mat-option [value]="time">{{ time }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          </div>
        }

        <h3>{{ 'activity.wellbeing.limits' | transloco }}</h3>
        <div class="row">
          <mat-form-field subscriptSizing="dynamic">
            <mat-label>{{ 'activity.wellbeing.games' | transloco }}</mat-label>
            <mat-select [value]="minutesOf('games')" (valueChange)="setKind('games', $event)">
              @for (minutes of gameOptions; track minutes) {
                <mat-option [value]="minutes">
                  {{
                    minutes
                      ? (minutes * 60 | pdDuration)
                      : ('activity.wellbeing.noLimit' | transloco)
                  }}
                </mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field subscriptSizing="dynamic">
            <mat-label>{{ 'activity.wellbeing.total' | transloco }}</mat-label>
            <mat-select [value]="minutesOf('total')" (valueChange)="setKind('total', $event)">
              @for (minutes of totalOptions; track minutes) {
                <mat-option [value]="minutes">
                  {{
                    minutes
                      ? (minutes * 60 | pdDuration)
                      : ('activity.wellbeing.noLimit' | transloco)
                  }}
                </mat-option>
              }
            </mat-select>
          </mat-form-field>
        </div>

        @if (minutesOf('games')) {
          <div class="row">
            <mat-form-field subscriptSizing="dynamic">
              <mat-label>{{ 'activity.wellbeing.gamesPerTask' | transloco }}</mat-label>
              <mat-select
                [value]="settings.value()?.gamesMinutesPerTask ?? 0"
                (valueChange)="save({ gamesMinutesPerTask: $event })"
              >
                @for (minutes of gamesPerTaskOptions; track minutes) {
                  <mat-option [value]="minutes">
                    {{
                      minutes
                        ? ('activity.wellbeing.plusMinutes' | transloco: { minutes })
                        : ('activity.wellbeing.noBonus' | transloco)
                    }}
                  </mat-option>
                }
              </mat-select>
              <mat-hint>{{ 'activity.wellbeing.gamesPerTaskHint' | transloco }}</mat-hint>
            </mat-form-field>
          </div>
        }

        @for (limit of appLimits(); track limit.app) {
          <div class="row app">
            <span class="name">{{ nameOf(limit.app) }}</span>
            <mat-form-field subscriptSizing="dynamic" class="narrow">
              <mat-select
                [value]="limit.minutes"
                [attr.aria-label]="'activity.wellbeing.perDay' | transloco"
                (valueChange)="setApp(limit.app, $event)"
              >
                @for (minutes of appOptions; track minutes) {
                  <mat-option [value]="minutes">{{ minutes * 60 | pdDuration }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <button
              matIconButton
              [matTooltip]="'core.actions.delete' | transloco"
              [attr.aria-label]="'core.actions.delete' | transloco"
              (click)="setApp(limit.app, 0)"
            >
              <mat-icon>delete</mat-icon>
            </button>
          </div>
        }
        <div class="row">
          <mat-form-field subscriptSizing="dynamic">
            <mat-label>{{ 'activity.wellbeing.addApp' | transloco }}</mat-label>
            <mat-select [value]="null" (valueChange)="$event && setApp($event, 60)">
              @for (app of freeApps(); track app.app) {
                <mat-option [value]="app.app">{{ app.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        </div>

        @if (settings.value(); as current) {
          <h3>{{ 'activity.wellbeing.focus' | transloco }}</h3>
          <div class="row">
            @for (field of focusFields; track field) {
              <mat-form-field subscriptSizing="dynamic" class="narrow">
                <mat-label>{{ 'activity.wellbeing.' + field | transloco }}</mat-label>
                <mat-select [value]="current[field]" (valueChange)="setFocus(field, $event)">
                  @for (value of focusOptions[field]; track value) {
                    <mat-option [value]="value">
                      {{ field === 'roundsBeforeLongBreak' ? value : (value * 60 | pdDuration) }}
                    </mat-option>
                  }
                </mat-select>
              </mat-form-field>
            }
          </div>
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    .hint {
      margin: 0 0 12px;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    h3 {
      margin: 16px 0 8px;
      font: var(--mat-sys-title-small);
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px;
      margin-bottom: 8px;
    }
    .row mat-form-field {
      flex: 0 1 240px;
    }
    .row mat-form-field.narrow {
      flex: 0 1 160px;
    }
    .name {
      flex: 0 1 240px;
      overflow-wrap: anywhere;
    }
  `,
})
export class WellbeingSettingsComponent {
  private readonly api = inject(ActivityApi);

  protected readonly breakOptions = BREAK_MINUTES;
  protected readonly summaryTimes = SUMMARY_TIMES;
  protected readonly gameOptions = GAME_LIMITS;
  protected readonly gamesPerTaskOptions = [0, 5, 10, 15, 20, 30];
  protected readonly totalOptions = TOTAL_LIMITS;
  protected readonly appOptions = APP_LIMITS;
  protected readonly focusOptions = FOCUS;
  protected readonly focusFields = Object.keys(FOCUS) as (keyof typeof FOCUS)[];

  protected readonly settings = this.api.settings();
  protected readonly apps = this.api.apps();
  private readonly limitsResource = this.api.limits();
  /** Changed at once on the page, saved to the server behind it. */
  private readonly limits = signal<ActivityLimitInput[] | null>(null);
  private readonly current = computed(
    () =>
      this.limits() ??
      this.limitsResource.value().map(({ kind, app, minutes }) => ({ kind, app, minutes })),
  );

  protected readonly appLimits = computed(() =>
    this.current()
      .filter((limit) => limit.kind === 'app')
      .map((limit) => ({ app: limit.app ?? '', minutes: limit.minutes })),
  );
  protected readonly freeApps = computed(() => {
    const limited = new Set(this.appLimits().map((limit) => limit.app));
    return this.apps.value().filter((app) => !app.excluded && !limited.has(app.app));
  });

  protected minutesOf(kind: 'games' | 'total'): number {
    return this.current().find((limit) => limit.kind === kind)?.minutes ?? 0;
  }

  protected nameOf(app: string): string {
    return this.apps.value().find((known) => known.app === app)?.name ?? app;
  }

  protected setFocus(field: keyof typeof FOCUS, value: number): void {
    void this.save({ [field]: value });
  }

  protected async save(update: ActivitySettingsUpdate): Promise<void> {
    await firstValueFrom(this.api.saveSettings(update));
    this.settings.reload();
  }

  protected setKind(kind: 'games' | 'total', minutes: number): void {
    const others = this.current().filter((limit) => limit.kind !== kind);
    void this.saveLimits(minutes ? [...others, { kind, app: null, minutes }] : others);
  }

  /** `0` removes the program's limit. */
  protected setApp(app: string, minutes: number): void {
    const others = this.current().filter((limit) => !(limit.kind === 'app' && limit.app === app));
    void this.saveLimits(minutes ? [...others, { kind: 'app', app, minutes }] : others);
  }

  private async saveLimits(limits: ActivityLimitInput[]): Promise<void> {
    this.limits.set(limits);
    await firstValueFrom(this.api.saveLimits(limits));
    this.limitsResource.reload();
  }
}
