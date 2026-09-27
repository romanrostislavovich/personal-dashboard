import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import { WowSummary } from '@pd/contracts';

/** World of Warcraft: персонаж, экипировка, очки достижений и последние ачивки. */
@Component({
  selector: 'pd-wow-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, DecimalPipe, MatIconModule, TranslocoPipe],
  template: `
    @let s = summary();
    <div class="head">
      @if (s.avatarUrl) {
        <img class="avatar" [src]="s.avatarUrl" alt="" />
      }
      <div class="who">
        <a class="name" [href]="s.profileUrl" target="_blank" rel="noopener">{{ s.name }}</a>
        <span class="muted">
          {{ s.level }} · {{ s.raceName }} · {{ s.className }}
          @if (s.specName) {
            ({{ s.specName }})
          }
        </span>
        <span class="muted">
          {{ s.realm }}
          @if (s.guild) {
            · &lt;{{ s.guild }}&gt;
          }
        </span>
      </div>
    </div>

    <div class="stats">
      <div class="stat">
        <span class="label">{{ 'games.wow.itemLevel' | transloco }}</span>
        <span class="value">{{ s.itemLevel ?? '—' }}</span>
      </div>
      <div class="stat">
        <span class="label">{{ 'games.wow.achievementPoints' | transloco }}</span>
        <span class="value">{{ s.achievementPoints | number }}</span>
      </div>
      <div class="stat">
        <span class="label">{{ 'games.wow.achievements' | transloco }}</span>
        <span class="value">{{ s.totalAchievements | number }}</span>
      </div>
    </div>

    <h4 class="section">{{ 'games.wow.recentAchievements' | transloco }}</h4>
    <ul class="achievements">
      @for (a of s.recentAchievements; track a.id) {
        <li>
          <mat-icon inline>emoji_events</mat-icon>
          <a
            [href]="'https://www.wowhead.com/achievement=' + a.id"
            target="_blank"
            rel="noopener"
            >{{ a.name }}</a
          >
          <span class="muted">{{ a.completedAt | date: 'd MMM y' }}</span>
        </li>
      }
    </ul>
    @if (s.lastLoginAt) {
      <p class="muted">
        {{ 'games.wow.lastLogin' | transloco }} {{ s.lastLoginAt | date: 'd MMM y, HH:mm' }}
      </p>
    }
  `,
  styles: `
    .head {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .avatar {
      width: 56px;
      height: 56px;
      border-radius: 8px;
    }
    .who {
      display: flex;
      flex-direction: column;
    }
    .name {
      font: var(--mat-sys-title-large);
      color: inherit;
      text-decoration: none;
    }
    .muted {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .stats {
      display: flex;
      flex-wrap: wrap;
      gap: 32px;
      margin: 16px 0 8px;
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
    .section {
      font: var(--mat-sys-title-small);
      margin: 16px 0 8px;
    }
    .achievements {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .achievements li {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 0;
    }
    .achievements mat-icon {
      color: #e0a100;
    }
    .achievements a {
      flex: 1;
      color: inherit;
      text-decoration: none;
    }
  `,
})
export class WowCardComponent {
  readonly summary = input.required<WowSummary>();
}
