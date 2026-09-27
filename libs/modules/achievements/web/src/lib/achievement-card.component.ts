import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Achievement } from '@pd/contracts';

/**
 * One achievement: icon, title, description, rarity and either progress or the unlock date.
 * The rarity color (`--rarity`) tints the border, the icon badge and the progress bar.
 */
@Component({
  selector: 'pd-achievement-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, DecimalPipe, TranslocoPipe],
  host: { '[class]': "'rarity-' + achievement().rarity" },
  template: `
    @let a = achievement();
    <div class="card" [class.locked]="!a.unlockedAt">
      <span class="badge" aria-hidden="true">{{ a.icon }}</span>
      <div class="body">
        <div class="top">
          <span class="title">{{ a.title }}</span>
          <span class="rarity">{{ 'achievements.rarity.' + a.rarity | transloco }}</span>
        </div>
        <span class="description">{{ a.description }}</span>
        @if (a.unlockedAt) {
          <span class="footer unlocked">
            <span>{{ a.unlockedAt | date: 'd MMM y' }}</span>
            <span class="xp">+{{ a.xp }} XP</span>
          </span>
        } @else {
          <span
            class="bar"
            role="progressbar"
            [attr.aria-valuenow]="percent()"
            aria-valuemin="0"
            aria-valuemax="100"
          >
            <span [style.width.%]="percent()"></span>
          </span>
          <span class="footer">
            <span>{{ a.progress | number }} / {{ a.goal | number }}</span>
            <span class="xp">{{ a.xp }} XP</span>
          </span>
        }
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      --rarity: var(--pd-rarity-common);
    }
    :host(.rarity-rare) {
      --rarity: var(--pd-rarity-rare);
    }
    :host(.rarity-epic) {
      --rarity: var(--pd-rarity-epic);
    }
    :host(.rarity-legendary) {
      --rarity: var(--pd-rarity-legendary);
    }
    .card {
      display: flex;
      gap: 14px;
      height: 100%;
      box-sizing: border-box;
      padding: 14px;
      border-radius: 16px;
      border: 1px solid color-mix(in srgb, var(--rarity) 45%, var(--pd-border));
      background:
        radial-gradient(
          140px 90px at 0% 0%,
          color-mix(in srgb, var(--rarity) 16%, transparent),
          transparent 70%
        ),
        var(--pd-card);
      transition: transform 160ms ease;
    }
    .card:not(.locked):hover {
      transform: translateY(-2px);
    }
    .badge {
      display: grid;
      place-items: center;
      flex: none;
      width: 52px;
      height: 52px;
      border-radius: 14px;
      font-size: 28px;
      line-height: 1;
      background: color-mix(in srgb, var(--rarity) 20%, var(--mat-sys-surface-container));
      box-shadow:
        inset 0 0 0 1px color-mix(in srgb, var(--rarity) 55%, transparent),
        0 6px 20px -8px var(--rarity);
    }
    /* Locked achievements are grey so unlocked ones stand out. */
    .locked {
      border-color: var(--pd-border);
      background: var(--pd-card);
    }
    .locked .badge {
      filter: grayscale(1);
      opacity: 0.5;
      box-shadow: inset 0 0 0 1px var(--pd-border);
      background: var(--mat-sys-surface-container);
    }
    .body {
      display: flex;
      flex-direction: column;
      gap: 4px;
      flex: 1;
      min-width: 0;
    }
    .top {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 8px;
    }
    .title {
      font: 700 0.95rem / 1.3 var(--pd-font-heading);
    }
    .rarity {
      flex: none;
      font: 700 0.65rem / 1 var(--pd-font);
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--rarity);
    }
    .description {
      font: 0.8rem / 1.35 var(--pd-font);
      color: var(--mat-sys-on-surface-variant);
    }
    .bar {
      height: 6px;
      margin-top: 6px;
      border-radius: 3px;
      background: color-mix(in srgb, var(--mat-sys-on-surface) 10%, transparent);
      overflow: hidden;
    }
    .bar span {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: var(--rarity);
    }
    .footer {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      margin-top: auto;
      padding-top: 4px;
      font: 0.75rem / 1.3 var(--pd-font);
      color: var(--mat-sys-on-surface-variant);
    }
    .unlocked {
      color: var(--mat-sys-on-surface);
    }
    .xp {
      font-weight: 700;
      color: var(--rarity);
    }
  `,
})
export class AchievementCardComponent {
  readonly achievement = input.required<Achievement>();

  protected readonly percent = computed(() => {
    const { progress, goal } = this.achievement();
    return Math.round((progress / goal) * 100);
  });
}
