import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { TranslocoPipe } from '@jsverse/transloco';
import { WowHistoryPoint, WowStats, WowSummary } from '@pd/contracts';
import { SparklineComponent, SparklinePoint } from '@pd/web-core';

/** Item quality as the game colours it; anything else keeps the text colour. */
const QUALITY_COLORS: Record<string, string> = {
  POOR: '#9d9d9d',
  UNCOMMON: '#1eff00',
  RARE: '#0070dd',
  EPIC: '#a335ee',
  LEGENDARY: '#ff8000',
  ARTIFACT: '#e6cc80',
  HEIRLOOM: '#00ccff',
};

/** The lines of the character sheet, in the order the game shows them. */
const STAT_KEYS: (keyof WowStats)[] = [
  'health',
  'power',
  'strength',
  'agility',
  'intellect',
  'stamina',
  'armor',
  'crit',
  'haste',
  'mastery',
  'versatility',
];
const PERCENT_STATS = new Set<keyof WowStats>(['crit', 'haste', 'mastery', 'versatility']);

/**
 * Everything about one character: the sheet, the gear, talents, Mythic+, raids, PvP,
 * collections, reputations and professions. A part the game version does not have (most of
 * them in Classic) has no tab at all.
 */
@Component({
  selector: 'pd-wow-character-details',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, DecimalPipe, MatIconModule, MatTabsModule, TranslocoPipe, SparklineComponent],
  templateUrl: './wow-character-details.component.html',
  styleUrl: './wow-character-details.component.scss',
})
export class WowCharacterDetailsComponent {
  readonly character = input.required<WowSummary>();

  protected readonly details = computed(() => this.character().details);

  protected readonly stats = computed(() => {
    const stats = this.details()?.stats;
    if (!stats) {
      return [];
    }
    return STAT_KEYS.flatMap((key) => {
      const value = stats[key];
      return typeof value === 'number'
        ? [{ key, value, percent: PERCENT_STATS.has(key), power: stats.powerType }]
        : [];
    });
  });

  protected readonly itemLevelHistory = computed(() => this.series('itemLevel'));
  protected readonly ratingHistory = computed(() => this.series('mythicRating'));

  /** Collections with a number: the game version may not have some of them. */
  protected readonly collections = computed(() => {
    const collections = this.details()?.collections;
    return collections
      ? (Object.entries(collections) as [string, number | null][]).flatMap(([key, value]) =>
          value === null ? [] : [{ key, value }],
        )
      : [];
  });

  protected qualityColor(quality: string | null): string | null {
    return quality ? (QUALITY_COLORS[quality] ?? null) : null;
  }

  /** `1500000` ms → `25:00` */
  protected duration(ms: number): string {
    const seconds = Math.round(ms / 1000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }

  private series(field: keyof Omit<WowHistoryPoint, 'day'>): SparklinePoint[] {
    return this.character().history.flatMap((point) => {
      const value = point[field];
      return value === null ? [] : [{ at: point.day, value }];
    });
  }
}
