import { z } from 'zod';
import { LocalDate } from './local-date';

/** A piece of gear the character wears. */
export interface WowItem {
  /** The slot as the game names it ("Head", "Main Hand"). */
  slot: string;
  name: string;
  level: number | null;
  /** `POOR` … `LEGENDARY`, `ARTIFACT`, `HEIRLOOM`: the colour of the name. */
  quality: string | null;
  enchants: string[];
  gems: string[];
}

/** What the character sheet shows; a value the game does not have for the character is `null`. */
export interface WowStats {
  health: number | null;
  power: number | null;
  /** "Mana", "Rage"… */
  powerType: string | null;
  strength: number | null;
  agility: number | null;
  intellect: number | null;
  stamina: number | null;
  armor: number | null;
  /** Percent. */
  crit: number | null;
  haste: number | null;
  mastery: number | null;
  versatility: number | null;
}

export interface WowSpec {
  name: string;
  active: boolean;
  /** The talents taken in the active loadout. */
  talents: string[];
  /** The string the game imports a build from. */
  loadoutCode: string | null;
}

export interface WowMythicRun {
  dungeon: string;
  level: number;
  /** Finished within the timer. */
  timed: boolean;
  durationMs: number;
  completedAt: string;
  rating: number | null;
}

export interface WowMythic {
  rating: number;
  /** The best run of each dungeon this season, highest key first. */
  runs: WowMythicRun[];
}

export interface WowRaid {
  expansion: string;
  name: string;
  /** Bosses killed on each difficulty. */
  modes: { difficulty: string; killed: number; total: number }[];
}

export interface WowPvpBracket {
  /** `2v2`, `3v3`, `rbg`, `shuffle-…`. */
  bracket: string;
  rating: number;
  played: number;
  won: number;
}

export interface WowPvp {
  honorLevel: number | null;
  honorableKills: number | null;
  brackets: WowPvpBracket[];
}

/** How much is collected; `null` — the game version has no such collection (Classic). */
export interface WowCollections {
  mounts: number | null;
  pets: number | null;
  toys: number | null;
  heirlooms: number | null;
  titles: number | null;
  quests: number | null;
}

export interface WowReputation {
  faction: string;
  /** "Exalted", "Renown 12"… */
  standing: string;
  value: number | null;
  max: number | null;
}

export interface WowProfession {
  name: string;
  primary: boolean;
  /** One line per expansion the profession has been levelled in. */
  tiers: { name: string; skill: number; max: number }[];
}

export interface WowGuild {
  name: string;
  members: number | null;
  achievementPoints: number | null;
  /** The character's rank: 0 is the guild master. */
  rank: number | null;
}

/** Everything about a character beyond its summary line. */
export interface WowDetails {
  /** The full-body picture of the character. */
  renderUrl: string | null;
  /** The title the character wears ("the Patient"). */
  title: string | null;
  faction: string | null;
  items: WowItem[];
  stats: WowStats | null;
  specs: WowSpec[];
  mythic: WowMythic | null;
  raids: WowRaid[];
  pvp: WowPvp | null;
  collections: WowCollections;
  reputations: WowReputation[];
  professions: WowProfession[];
  guild: WowGuild | null;
}

/** A day of the character's history: Blizzard gives only the current numbers. */
export interface WowHistoryPoint {
  day: LocalDate;
  itemLevel: number | null;
  mythicRating: number | null;
  achievementPoints: number | null;
  mounts: number | null;
  pets: number | null;
  toys: number | null;
}

/** The WoW Token: what a month of game time costs in gold on the auction house. */
export interface WowToken {
  region: string;
  /** Gold. */
  price: number;
  updatedAt: string;
  /** One point a day. */
  history: { day: LocalDate; price: number }[];
}

/** `PATCH /api/games/wow/:accountId`: the notifications of one character. */
export const wowCharacterUpdateSchema = z.object({
  /** Tell about new Mythic+ records, boss kills, PvP rating, mounts, pets, titles. */
  notify: z.boolean(),
});
export type WowCharacterUpdate = z.infer<typeof wowCharacterUpdateSchema>;
