import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { WakatimePeriod } from '@pd/contracts';
import { AccountsApi } from './accounts/accounts.api';
import { DurationPipe } from './ui/duration.pipe';
import { WakatimeApi } from './wakatime/wakatime.api';

/**
 * Home widget: the streak and the contributions across GitHub, GitLab and Bitbucket, coding time
 * today and over the week.
 */
@Component({
  selector: 'pd-development-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, RouterLink, MatCardModule, MatButtonModule, TranslocoPipe, DurationPipe],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-card-title>👨‍💻 {{ 'development.title' | transloco }}</mat-card-title>
      </mat-card-header>
      <mat-card-content class="content">
        @if (profile.value(); as p) {
          <div class="stat">
            <span class="label">{{ 'development.widget.streak' | transloco }}</span>
            <span class="value">🔥 {{ p.streak.current }}</span>
            <span class="sub" [class.todo]="p.today === 0 && p.streak.current > 0">
              {{
                (p.today > 0 ? 'development.widget.doneToday' : 'development.widget.notYetToday')
                  | transloco: { count: p.today }
              }}
            </span>
          </div>
          <div class="stat">
            <span class="label">{{ 'development.widget.contributions' | transloco }}</span>
            <span class="value">{{ p.week | number }}</span>
            <span class="sub">{{ 'development.widget.week' | transloco }}</span>
          </div>
        }
        @if (coding.value(); as c) {
          @if (c.allTime.since) {
            <div class="stat">
              <span class="label">{{ 'development.widget.coding' | transloco }}</span>
              <span class="value">{{ c.todaySeconds | pdDuration }}</span>
              <span class="sub">
                {{ c.totalSeconds | pdDuration }} {{ 'development.widget.week' | transloco }}
              </span>
            </div>
          }
        }
        @if (isEmpty()) {
          <p class="muted">{{ 'development.widget.empty' | transloco }}</p>
        }
      </mat-card-content>
      <mat-card-actions align="end">
        <a matButton routerLink="/development/summary">{{
          'development.widget.open' | transloco
        }}</a>
      </mat-card-actions>
    </mat-card>
  `,
  styles: `
    .content {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
      gap: 12px;
      padding-top: 12px;
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
      font: var(--mat-sys-title-large);
    }
    .sub,
    .muted {
      font: var(--mat-sys-label-small);
      color: var(--mat-sys-on-surface-variant);
    }
    /* The streak is alive but today has nothing yet. */
    .sub.todo {
      color: var(--mat-sys-error);
    }
    .muted {
      grid-column: 1 / -1;
      margin: 0;
      font: var(--mat-sys-body-medium);
    }
  `,
})
export class DevelopmentWidget {
  protected readonly profile = inject(AccountsApi).summary();
  protected readonly coding = inject(WakatimeApi).stats(signal<WakatimePeriod>(7));

  /** Neither the code hosting services nor WakaTime gave anything yet. */
  protected isEmpty(): boolean {
    const loaded = !this.profile.isLoading() && !this.coding.isLoading();
    return loaded && !this.profile.value() && !this.coding.value()?.allTime.since;
  }
}
