import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { TranslocoPipe } from '@jsverse/transloco';
import { Achievement, ACHIEVEMENT_RARITIES, AchievementRarity } from '@pd/contracts';
import { LevelCardComponent, RealtimeClient } from '@pd/web-core';
import { AchievementCardComponent } from './achievement-card.component';
import { AchievementsApi } from './achievements.api';

type Filter = 'all' | 'unlocked' | 'locked';

const RECENT_COUNT = 4;

@Component({
  selector: 'pd-achievements-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonToggleModule, TranslocoPipe, AchievementCardComponent, LevelCardComponent],
  template: `
    <header class="page-header">
      <h1 class="page-title">{{ 'achievements.title' | transloco }}</h1>
      <mat-button-toggle-group
        [value]="filter()"
        (change)="filter.set($event.value)"
        hideSingleSelectionIndicator
      >
        <mat-button-toggle value="all">{{
          'achievements.filter.all' | transloco
        }}</mat-button-toggle>
        <mat-button-toggle value="unlocked">
          {{ 'achievements.filter.unlocked' | transloco }}
        </mat-button-toggle>
        <mat-button-toggle value="locked">
          {{ 'achievements.filter.locked' | transloco }}
        </mat-button-toggle>
      </mat-button-toggle-group>
    </header>

    <div class="overview">
      <pd-level-card />
      <!-- Rarity counters double as a filter: click again to reset. -->
      @for (stat of rarityStats(); track stat.rarity) {
        <button
          type="button"
          class="rarity-stat"
          [class]="'rarity-stat rarity-' + stat.rarity"
          [class.selected]="rarity() === stat.rarity"
          [attr.aria-pressed]="rarity() === stat.rarity"
          (click)="toggleRarity(stat.rarity)"
        >
          <span class="rarity-name">{{ 'achievements.rarity.' + stat.rarity | transloco }}</span>
          <span class="rarity-count">
            {{ stat.unlocked }}<span class="of">/{{ stat.total }}</span>
          </span>
        </button>
      }
    </div>

    @if (recent().length && filter() !== 'locked' && !rarity()) {
      <section class="group">
        <h2 class="group-title">{{ 'achievements.recent' | transloco }}</h2>
        <div class="grid">
          @for (achievement of recent(); track achievement.id) {
            <pd-achievement-card [achievement]="achievement" />
          }
        </div>
      </section>
    }

    @for (group of groups(); track group.module) {
      <section class="group">
        <!-- A section is named like the module in the menu: translation key '<module>.title'. -->
        <h2 class="group-title">
          {{ group.module + '.title' | transloco }}
          <span class="group-count">{{ group.unlocked }} / {{ group.total }}</span>
        </h2>
        <div class="grid">
          @for (achievement of group.items; track achievement.id) {
            <pd-achievement-card [achievement]="achievement" />
          }
        </div>
      </section>
    } @empty {
      <p class="empty">{{ 'achievements.empty' | transloco }}</p>
    }
  `,
  styles: `
    .overview {
      display: grid;
      grid-template-columns: minmax(300px, 1.6fr) repeat(4, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 28px;
    }
    @media (max-width: 900px) {
      .overview {
        grid-template-columns: repeat(2, 1fr);
      }
      .overview pd-level-card {
        grid-column: 1 / -1;
      }
    }
    .rarity-stat {
      --rarity: var(--pd-rarity-common);
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 6px;
      padding: 14px 16px;
      border: 1px solid color-mix(in srgb, var(--rarity) 35%, var(--pd-border));
      border-radius: var(--pd-radius);
      background:
        radial-gradient(
          120px 80px at 100% 0%,
          color-mix(in srgb, var(--rarity) 18%, transparent),
          transparent 70%
        ),
        var(--pd-card);
      color: inherit;
      text-align: left;
      cursor: pointer;
      font: inherit;
    }
    .rarity-stat.selected {
      border-color: var(--rarity);
      box-shadow: 0 0 0 1px var(--rarity);
    }
    .rarity-rare {
      --rarity: var(--pd-rarity-rare);
    }
    .rarity-epic {
      --rarity: var(--pd-rarity-epic);
    }
    .rarity-legendary {
      --rarity: var(--pd-rarity-legendary);
    }
    .rarity-name {
      font: 700 0.7rem / 1 var(--pd-font);
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--rarity);
    }
    .rarity-count {
      font: 800 1.6rem / 1 var(--pd-font-heading);
    }
    .of {
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--mat-sys-on-surface-variant);
    }
    .group {
      margin-bottom: 28px;
    }
    .group-title {
      display: flex;
      align-items: baseline;
      gap: 10px;
      font: 700 1.1rem / 1.3 var(--pd-font-heading);
      margin: 0 0 12px;
    }
    .group-count {
      font: 600 0.8rem / 1 var(--pd-font);
      color: var(--mat-sys-on-surface-variant);
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(min(300px, 100%), 1fr));
      gap: 12px;
    }
  `,
})
export class AchievementsPage {
  private readonly achievements = inject(AchievementsApi).list();

  protected readonly filter = signal<Filter>('all');
  protected readonly rarity = signal<AchievementRarity | null>(null);

  protected readonly rarityStats = computed(() =>
    ACHIEVEMENT_RARITIES.map((rarity) => {
      const items = this.achievements.value().filter((a) => a.rarity === rarity);
      return { rarity, total: items.length, unlocked: items.filter((a) => a.unlockedAt).length };
    }),
  );

  protected readonly recent = computed(() =>
    this.achievements
      .value()
      .filter((a) => a.unlockedAt)
      .sort((a, b) => (b.unlockedAt ?? '').localeCompare(a.unlockedAt ?? ''))
      .slice(0, RECENT_COUNT),
  );

  /** Groups by module in metric registration order, with the filters applied. */
  protected readonly groups = computed(() => {
    const filter = this.filter();
    const rarity = this.rarity();
    const groups = new Map<string, { all: Achievement[]; visible: Achievement[] }>();
    for (const achievement of this.achievements.value()) {
      const group = groups.get(achievement.module) ?? { all: [], visible: [] };
      group.all.push(achievement);
      const statusMatches =
        filter === 'all' || (filter === 'unlocked') === Boolean(achievement.unlockedAt);
      if (statusMatches && (!rarity || achievement.rarity === rarity)) {
        group.visible.push(achievement);
      }
      groups.set(achievement.module, group);
    }
    return [...groups]
      .filter(([, group]) => group.visible.length > 0)
      .map(([module, group]) => ({
        module,
        items: group.visible,
        total: group.all.length,
        unlocked: group.all.filter((a) => a.unlockedAt).length,
      }));
  });

  constructor() {
    // Unlocked while the page is open — show it without a reload.
    const unlocks = inject(RealtimeClient).achievementUnlocks;
    effect(() => {
      if (unlocks() > 0) {
        untracked(() => this.achievements.reload());
      }
    });
  }

  protected toggleRarity(rarity: AchievementRarity): void {
    this.rarity.update((current) => (current === rarity ? null : rarity));
  }
}
