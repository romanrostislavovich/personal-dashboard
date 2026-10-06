import { WowDetails, WowGuild, WowPvp } from '@pd/contracts';
import {
  bracketName,
  currentSeasonId,
  parseBracket,
  parseCollections,
  parseItems,
  parseMythic,
  parseProfessions,
  parseRaids,
  parseReputations,
  parseSpecs,
  parseStats,
  RawBracket,
  RawEquipment,
  RawMythicProfile,
  RawMythicSeason,
  RawProfessions,
  RawRaids,
  RawReputations,
  RawSpecializations,
  RawStatistics,
} from './wow-details.parse';

/** What the details need from the Battle.net client: one part of the character, or an address. */
export interface CharacterReader {
  /** `/equipment`, `/statistics`…; `null` — Blizzard has no such part for this character. */
  part<T>(path: string): Promise<T | null>;
  /** An address Blizzard itself gave in an answer (a PvP bracket, the guild). */
  href<T>(href: string): Promise<T | null>;
}

/** What the character's summary and media already told. */
export interface CharacterBasics {
  name: string;
  title: string | null;
  faction: string | null;
  renderUrl: string | null;
  guild: { name: string; href: string | null } | null;
}

/**
 * Everything about a character beyond its summary: a request per part, all at once. A part
 * Blizzard does not have (most of them in Classic, a profile hidden by the player) is simply
 * empty — one missing part never fails the rest.
 */
export async function fetchDetails(
  reader: CharacterReader,
  basics: CharacterBasics,
): Promise<WowDetails> {
  const [
    equipment,
    statistics,
    specializations,
    mythicProfile,
    raids,
    pvpSummary,
    mounts,
    pets,
    toys,
    heirlooms,
    titles,
    quests,
    reputations,
    professions,
    guild,
  ] = await Promise.all([
    reader.part<RawEquipment>('/equipment'),
    reader.part<RawStatistics>('/statistics'),
    reader.part<RawSpecializations>('/specializations'),
    reader.part<RawMythicProfile>('/mythic-keystone-profile'),
    reader.part<RawRaids>('/encounters/raids'),
    reader.part<RawPvpSummary>('/pvp-summary'),
    reader.part<{ mounts?: unknown }>('/collections/mounts'),
    reader.part<{ pets?: unknown }>('/collections/pets'),
    reader.part<{ toys?: unknown }>('/collections/toys'),
    reader.part<{ heirlooms?: unknown }>('/collections/heirlooms'),
    reader.part<{ titles?: unknown }>('/titles'),
    reader.part<{ quests?: unknown }>('/quests/completed'),
    reader.part<RawReputations>('/reputations'),
    reader.part<RawProfessions>('/professions'),
    fetchGuild(reader, basics),
  ]);

  // The best runs of the season are a request of their own, by the season's id.
  const seasonId = currentSeasonId(mythicProfile);
  const season = seasonId
    ? await reader.part<RawMythicSeason>(`/mythic-keystone-profile/season/${seasonId}`)
    : null;

  return {
    renderUrl: basics.renderUrl,
    title: basics.title,
    faction: basics.faction,
    items: parseItems(equipment),
    stats: parseStats(statistics),
    specs: parseSpecs(specializations),
    mythic: parseMythic(mythicProfile, season),
    raids: parseRaids(raids),
    pvp: await fetchPvp(reader, pvpSummary),
    collections: parseCollections({ mounts, pets, toys, heirlooms, titles, quests }),
    reputations: parseReputations(reputations),
    professions: parseProfessions(professions),
    guild,
  };
}

interface RawPvpSummary {
  honor_level?: number;
  honorable_kills?: number;
  brackets?: { href?: string }[];
}

/** The rated brackets the character played this season: an address each. */
async function fetchPvp(
  reader: CharacterReader,
  summary: RawPvpSummary | null,
): Promise<WowPvp | null> {
  if (!summary) {
    return null;
  }
  const hrefs = (summary.brackets ?? []).flatMap((bracket) => bracket.href ?? []);
  const brackets = await Promise.all(
    hrefs.map(async (href) => parseBracket(bracketName(href), await reader.href<RawBracket>(href))),
  );
  return {
    honorLevel: summary.honor_level ?? null,
    honorableKills: summary.honorable_kills ?? null,
    brackets: brackets.filter((bracket) => bracket !== null).sort((a, b) => b.rating - a.rating),
  };
}

interface RawGuild {
  name?: string;
  member_count?: number;
  achievement_points?: number;
}

interface RawRoster {
  members?: { character?: { name?: string }; rank?: number }[];
}

/** The guild in a few numbers and the character's own rank in it — not the whole roster. */
async function fetchGuild(
  reader: CharacterReader,
  basics: CharacterBasics,
): Promise<WowGuild | null> {
  if (!basics.guild) {
    return null;
  }
  const href = basics.guild.href;
  const [guild, roster] = href
    ? await Promise.all([
        reader.href<RawGuild>(href),
        reader.href<RawRoster>(href.replace(/(\?|$)/, '/roster$1')),
      ])
    : [null, null];
  const own = roster?.members?.find(
    (member) => member.character?.name?.toLowerCase() === basics.name.toLowerCase(),
  );
  return {
    name: guild?.name ?? basics.guild.name,
    members: guild?.member_count ?? roster?.members?.length ?? null,
    achievementPoints: guild?.achievement_points ?? null,
    rank: own?.rank ?? null,
  };
}
