import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Achievement, levelFromXp } from '@pd/contracts';

/**
 * Player level from unlocked achievements: every achievement gives XP by rarity.
 * Achievements are computed by the API core, so the web core may read them directly.
 */
@Component({
  selector: 'pd-level-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslocoPipe],
  template: `
    @let p = progress();
    <a class="level" routerLink="/achievements">
      <span class="ring" [style.--pct]="percent()">
        <span class="level-number">{{ p.level }}</span>
      </span>
      <span class="text">
        <span class="title">{{ 'core.dashboard.level' | transloco: { level: p.level } }}</span>
        <span class="bar"><span [style.width.%]="percent()"></span></span>
        <span class="muted">
          {{ 'core.dashboard.xp' | transloco: { current: p.xpInLevel, next: p.xpForNext } }}
        </span>
        <span class="muted">
          {{ 'core.dashboard.unlocked' | transloco: { unlocked: unlocked(), total: total() } }}
        </span>
      </span>
    </a>
  `,
  styles: `
    :host {
      display: block;
    }
    .level {
      box-sizing: border-box;
      height: 100%;
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 16px 20px;
      border: 1px solid var(--pd-border);
      border-radius: var(--pd-radius);
      background: var(--pd-card);
      color: inherit;
      text-decoration: none;
      transition: border-color 160ms ease;
    }
    .level:hover {
      border-color: color-mix(in srgb, var(--mat-sys-primary) 45%, var(--pd-border));
    }
    .ring {
      --pct: 0;
      display: grid;
      place-items: center;
      flex: none;
      width: 64px;
      height: 64px;
      border-radius: 50%;
      background: conic-gradient(
        var(--mat-sys-primary) calc(var(--pct) * 1%),
        color-mix(in srgb, var(--mat-sys-on-surface) 10%, transparent) 0
      );
    }
    .level-number {
      display: grid;
      place-items: center;
      width: 52px;
      height: 52px;
      border-radius: 50%;
      background: var(--mat-sys-surface-container);
      font: 800 1.35rem / 1 var(--pd-font-heading);
    }
    .text {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }
    .title {
      font: 700 1rem / 1.2 var(--pd-font-heading);
    }
    .bar {
      height: 6px;
      border-radius: 3px;
      background: color-mix(in srgb, var(--mat-sys-on-surface) 10%, transparent);
      overflow: hidden;
    }
    .bar span {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: var(--pd-gradient);
    }
    .muted {
      font: 0.8rem / 1.3 var(--pd-font);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class LevelCardComponent {
  private readonly achievements = httpResource<Achievement[]>(() => '/api/achievements', {
    defaultValue: [],
  });

  protected readonly total = computed(() => this.achievements.value().length);
  private readonly unlockedList = computed(() =>
    this.achievements.value().filter((a) => a.unlockedAt),
  );
  protected readonly unlocked = computed(() => this.unlockedList().length);
  protected readonly progress = computed(() =>
    levelFromXp(this.unlockedList().reduce((sum, a) => sum + a.xp, 0)),
  );
  protected readonly percent = computed(() => {
    const { xpInLevel, xpForNext } = this.progress();
    return Math.round((xpInLevel / xpForNext) * 100);
  });
}
