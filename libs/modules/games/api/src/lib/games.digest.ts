import { Injectable, OnModuleInit } from '@nestjs/common';
import { MorningDigestService } from '@pd/api-core';
import { GameAccount } from '@pd/contracts';
import { GameAccountsService } from './game-accounts.service';

/** WoW achievements the digest looks at: enough to spot the new ones between two mornings. */
const RECENT_ACHIEVEMENTS = 5;

/** Game news in the morning digest: Dota records and rank, WoW levels, gear and achievements. */
@Injectable()
export class GamesDigest implements OnModuleInit {
  constructor(
    private readonly digest: MorningDigestService,
    private readonly accounts: GameAccountsService,
  ) {}

  onModuleInit(): void {
    this.digest.register({
      id: 'games.progress',
      module: 'games',
      description:
        'Game accounts. Dota 2: medal (rankTier = medal×10+stars, 8 = Immortal), leaderboard ' +
        'rank, personal records (kind, value, hero). WoW: level, item level, achievement points, Mythic+ rating (rounded down to 100), bosses ' +
        'killed in the newest raids, mounts collected, ' +
        'latest achievements. Steam: level, hours in games rounded down to a hundred, achievements ' +
        'unlocked. Tell about new records, a new medal, new achievements, a higher ilvl, a new ' +
        'hundred of hours.',
      // Match counts and win rates change with every game, so only milestones are compared.
      collect: async (userId) => {
        const accounts = (await this.accounts.list(userId)).filter((account) => account.summary);
        return accounts.length > 0 ? accounts.map(progress) : null;
      },
    });
  }
}

/** Steam hours are told in steps of a hundred: they grow every day by themselves. */
const STEAM_HOURS_STEP = 100;

function progress(account: GameAccount) {
  const summary = account.summary as NonNullable<GameAccount['summary']>;
  if (summary.game === 'steam') {
    return {
      game: 'steam',
      account: summary.personaName,
      level: summary.level,
      hoursMilestone: Math.floor(summary.totals.minutes / 60 / STEAM_HOURS_STEP) * STEAM_HOURS_STEP,
      achievements: summary.totals.achievements,
    };
  }
  if (summary.game === 'dota2') {
    return {
      game: 'dota2',
      account: account.displayName,
      rankTier: summary.rankTier,
      leaderboardRank: summary.leaderboardRank,
      records: summary.records.map(({ kind, value, hero }) => ({ kind, value, hero: hero.name })),
    };
  }
  return {
    game: 'wow',
    character: `${summary.name} (${summary.realm})`,
    level: summary.level,
    itemLevel: summary.itemLevel,
    achievementPoints: summary.achievementPoints,
    // Whole hundreds: the rating moves a little with every key.
    mythicRating: summary.details?.mythic
      ? Math.floor(summary.details.mythic.rating / 100) * 100
      : null,
    raids: (summary.details?.raids ?? []).slice(0, 2).map((raid) => ({
      raid: raid.name,
      killed: Math.max(0, ...raid.modes.map((mode) => mode.killed)),
    })),
    mounts: summary.details?.collections.mounts ?? null,
    latestAchievements: summary.recentAchievements
      .slice(0, RECENT_ACHIEVEMENTS)
      .map((achievement) => achievement.name),
  };
}
