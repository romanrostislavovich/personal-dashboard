import {
  WowCollections,
  WowItem,
  WowMythic,
  WowMythicRun,
  WowProfession,
  WowPvpBracket,
  WowRaid,
  WowReputation,
  WowSpec,
  WowStats,
} from '@pd/contracts';

/**
 * Battle.net answers turned into what the dashboard shows. Every parser takes the raw answer —
 * or `null` when Blizzard has none for the character (a Classic version, a hidden profile) — and
 * reads it leniently: the shapes differ between the versions of the game.
 */

const number = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/** Blizzard gives a rating value as `{ value }` or as `{ effective }`, or as a plain number. */
const amount = (value: unknown): number | null =>
  number(value) ??
  number((value as { effective?: unknown } | null)?.effective) ??
  number((value as { value?: unknown } | null)?.value);

const round = (value: number | null, digits = 1): number | null =>
  value === null ? null : Math.round(value * 10 ** digits) / 10 ** digits;

export function parseItems(raw: RawEquipment | null): WowItem[] {
  return (raw?.equipped_items ?? []).map((item) => ({
    slot: item.slot?.name ?? item.slot?.type ?? '',
    name: item.name ?? '',
    level: number(item.level?.value),
    quality: item.quality?.type ?? null,
    enchants: (item.enchantments ?? []).flatMap((e) =>
      e.display_string ? [e.display_string] : [],
    ),
    gems: (item.sockets ?? []).flatMap((socket) => {
      const name = socket.item?.name ?? socket.display_string;
      return name ? [name] : [];
    }),
  }));
}

export function parseStats(raw: RawStatistics | null): WowStats | null {
  if (!raw) {
    return null;
  }
  return {
    health: number(raw.health),
    power: number(raw.power),
    powerType: raw.power_type?.name ?? null,
    strength: amount(raw.strength),
    agility: amount(raw.agility),
    intellect: amount(raw.intellect),
    stamina: amount(raw.stamina),
    armor: amount(raw.armor),
    // The sheet shows one crit and one haste: melee for those who hit, spell for casters.
    crit: round(Math.max(amount(raw.melee_crit) ?? 0, amount(raw.spell_crit) ?? 0) || null),
    haste: round(Math.max(amount(raw.melee_haste) ?? 0, amount(raw.spell_haste) ?? 0) || null),
    mastery: round(amount(raw.mastery)),
    versatility: round(number(raw.versatility_damage_done_bonus)),
  };
}

/** The specializations of the current game; a Classic talent tree answers in another shape. */
export function parseSpecs(raw: RawSpecializations | null): WowSpec[] {
  const active = raw?.active_specialization?.name ?? null;
  return (raw?.specializations ?? []).flatMap((spec) => {
    const name = spec.specialization?.name;
    if (!name) {
      return [];
    }
    const loadout = spec.loadouts?.find((l) => l.is_active) ?? spec.loadouts?.[0];
    const talents = [
      ...(loadout?.selected_class_talents ?? []),
      ...(loadout?.selected_spec_talents ?? []),
      ...(loadout?.selected_hero_talents ?? []),
      ...(spec.talents ?? []),
    ].flatMap((talent) => {
      const talentName =
        talent.tooltip?.talent?.name ?? talent.talent?.name ?? talent.spell_tooltip?.spell?.name;
      return talentName ? [talentName] : [];
    });
    return [
      {
        name,
        active: name === active,
        talents: [...new Set(talents)],
        loadoutCode: loadout?.talent_loadout_code ?? null,
      },
    ];
  });
}

/** The season's best run of each dungeon, highest key first. */
export function parseMythic(
  profile: RawMythicProfile | null,
  season: RawMythicSeason | null,
): WowMythic | null {
  const rating =
    number(season?.mythic_rating?.rating) ?? number(profile?.current_mythic_rating?.rating);
  const runs = season?.best_runs ?? profile?.current_period?.best_runs ?? [];
  if (rating === null && runs.length === 0) {
    return null;
  }
  const best = new Map<string, WowMythicRun>();
  for (const run of runs) {
    const dungeon = run.dungeon?.name;
    const level = number(run.keystone_level);
    if (!dungeon || level === null) {
      continue;
    }
    const parsed: WowMythicRun = {
      dungeon,
      level,
      timed: Boolean(run.is_completed_within_time),
      durationMs: number(run.duration) ?? 0,
      completedAt: new Date(number(run.completed_timestamp) ?? 0).toISOString(),
      rating: round(number(run.mythic_rating?.rating)),
    };
    const known = best.get(dungeon);
    if (!known || (parsed.rating ?? parsed.level) > (known.rating ?? known.level)) {
      best.set(dungeon, parsed);
    }
  }
  return {
    rating: Math.round(rating ?? 0),
    runs: [...best.values()].sort((a, b) => b.level - a.level),
  };
}

/** The current season is the last of the list. */
export function currentSeasonId(profile: RawMythicProfile | null): number | null {
  const ids = (profile?.seasons ?? []).flatMap((season) => number(season.id) ?? []);
  return ids.length > 0 ? Math.max(...ids) : null;
}

/** The raids of the newest expansions the character has set foot in, newest first. */
export function parseRaids(raw: RawRaids | null, expansions = 2): WowRaid[] {
  return (raw?.expansions ?? [])
    .slice(-expansions)
    .reverse()
    .flatMap((expansion) =>
      [...(expansion.instances ?? [])].reverse().map((instance) => ({
        expansion: expansion.expansion?.name ?? '',
        name: instance.instance?.name ?? '',
        modes: (instance.modes ?? []).map((mode) => ({
          difficulty: mode.difficulty?.name ?? mode.difficulty?.type ?? '',
          killed: number(mode.progress?.completed_count) ?? 0,
          total: number(mode.progress?.total_count) ?? 0,
        })),
      })),
    );
}

/** `…/pvp-bracket/shuffle-paladin-retribution?namespace=…` → `shuffle-paladin-retribution` */
export function bracketName(href: string): string {
  return href.split('?')[0].split('/').pop() ?? href;
}

export function parseBracket(name: string, raw: RawBracket | null): WowPvpBracket | null {
  const rating = number(raw?.rating);
  if (rating === null) {
    return null;
  }
  return {
    bracket: name,
    rating,
    played: number(raw?.season_match_statistics?.played) ?? 0,
    won: number(raw?.season_match_statistics?.won) ?? 0,
  };
}

/**
 * How many there are in an answer. Blizzard leaves the list out when it is empty, so an answer
 * without the list is zero; no answer at all (`null`) is "this version has no such collection".
 */
function count<K extends string>(
  answer: Partial<Record<K, unknown>> | null,
  key: K,
): number | null {
  if (!answer) {
    return null;
  }
  const list = answer[key];
  return Array.isArray(list) ? list.length : 0;
}

export function parseCollections(raw: {
  mounts: { mounts?: unknown } | null;
  pets: { pets?: unknown } | null;
  toys: { toys?: unknown } | null;
  heirlooms: { heirlooms?: unknown } | null;
  titles: { titles?: unknown } | null;
  quests: { quests?: unknown } | null;
}): WowCollections {
  return {
    mounts: count(raw.mounts, 'mounts'),
    pets: count(raw.pets, 'pets'),
    toys: count(raw.toys, 'toys'),
    heirlooms: count(raw.heirlooms, 'heirlooms'),
    titles: count(raw.titles, 'titles'),
    quests: count(raw.quests, 'quests'),
  };
}

/** The factions the character got furthest with first; the list is cut to `limit`. */
export function parseReputations(raw: RawReputations | null, limit = 60): WowReputation[] {
  return (raw?.reputations ?? [])
    .flatMap((reputation) => {
      const faction = reputation.faction?.name;
      const standing = reputation.standing?.name;
      if (!faction || !standing) {
        return [];
      }
      return [
        {
          faction,
          standing,
          value: number(reputation.standing?.value),
          max: number(reputation.standing?.max),
          tier: number(reputation.standing?.tier) ?? 0,
        },
      ];
    })
    .sort((a, b) => b.tier - a.tier || (b.value ?? 0) - (a.value ?? 0))
    .slice(0, limit)
    .map(({ tier: _tier, ...reputation }) => reputation);
}

export function parseProfessions(raw: RawProfessions | null): WowProfession[] {
  const list = (professions: RawProfession[] | undefined, primary: boolean): WowProfession[] =>
    (professions ?? []).flatMap((profession) => {
      const name = profession.profession?.name;
      if (!name) {
        return [];
      }
      // An old profession without tiers has its skill on the profession itself.
      const tiers = profession.tiers?.length
        ? profession.tiers.map((tier) => ({
            name: tier.tier?.name ?? name,
            skill: number(tier.skill_points) ?? 0,
            max: number(tier.max_skill_points) ?? 0,
          }))
        : [
            {
              name,
              skill: number(profession.skill_points) ?? 0,
              max: number(profession.max_skill_points) ?? 0,
            },
          ];
      return [{ name, primary, tiers: tiers.filter((tier) => tier.skill > 0 || tier.max > 0) }];
    });
  return [...list(raw?.primaries, true), ...list(raw?.secondaries, false)];
}

// --- Raw Battle.net answers (only the fields we use) ---

interface Named {
  name?: string;
}

export interface RawEquipment {
  equipped_items?: {
    slot?: { type?: string; name?: string };
    name?: string;
    quality?: { type?: string };
    level?: { value?: number };
    enchantments?: { display_string?: string }[];
    sockets?: { item?: Named; display_string?: string }[];
  }[];
}

export interface RawStatistics {
  health?: number;
  power?: number;
  power_type?: Named;
  strength?: unknown;
  agility?: unknown;
  intellect?: unknown;
  stamina?: unknown;
  armor?: unknown;
  melee_crit?: unknown;
  spell_crit?: unknown;
  melee_haste?: unknown;
  spell_haste?: unknown;
  mastery?: unknown;
  versatility_damage_done_bonus?: number;
}

interface RawTalent {
  tooltip?: { talent?: Named };
  talent?: Named;
  spell_tooltip?: { spell?: Named };
}

export interface RawSpecializations {
  active_specialization?: Named;
  specializations?: {
    specialization?: Named;
    talents?: RawTalent[];
    loadouts?: {
      is_active?: boolean;
      talent_loadout_code?: string;
      selected_class_talents?: RawTalent[];
      selected_spec_talents?: RawTalent[];
      selected_hero_talents?: RawTalent[];
    }[];
  }[];
}

interface RawRun {
  dungeon?: Named;
  keystone_level?: number;
  duration?: number;
  is_completed_within_time?: boolean;
  completed_timestamp?: number;
  mythic_rating?: { rating?: number };
}

export interface RawMythicProfile {
  current_mythic_rating?: { rating?: number };
  current_period?: { best_runs?: RawRun[] };
  seasons?: { id?: number }[];
}

export interface RawMythicSeason {
  mythic_rating?: { rating?: number };
  best_runs?: RawRun[];
}

export interface RawRaids {
  expansions?: {
    expansion?: Named;
    instances?: {
      instance?: Named;
      modes?: {
        difficulty?: { type?: string; name?: string };
        progress?: { completed_count?: number; total_count?: number };
      }[];
    }[];
  }[];
}

export interface RawBracket {
  rating?: number;
  season_match_statistics?: { played?: number; won?: number };
}

export interface RawReputations {
  reputations?: {
    faction?: Named;
    standing?: { name?: string; value?: number; max?: number; tier?: number };
  }[];
}

interface RawProfession {
  profession?: Named;
  skill_points?: number;
  max_skill_points?: number;
  tiers?: { tier?: Named; skill_points?: number; max_skill_points?: number }[];
}

export interface RawProfessions {
  primaries?: RawProfession[];
  secondaries?: RawProfession[];
}
