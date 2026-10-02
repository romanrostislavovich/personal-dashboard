import { WowDetails } from '@pd/contracts';
import { fetchDetails } from './wow-details.fetch';
import {
  bracketName,
  parseItems,
  parseMythic,
  parseProfessions,
  parseRaids,
  parseReputations,
  parseSpecs,
  parseStats,
} from './wow-details.parse';
import { wowNews } from './wow-news';

describe('parsing Battle.net answers', () => {
  it('reads the gear with its enchants and gems', () => {
    expect(
      parseItems({
        equipped_items: [
          {
            slot: { type: 'HEAD', name: 'Head' },
            name: 'Helm of Tests',
            quality: { type: 'EPIC' },
            level: { value: 619 },
            enchantments: [{ display_string: 'Enchanted: +10 Haste' }],
            sockets: [{ item: { name: 'Ruby' } }, { display_string: 'Empty socket' }],
          },
        ],
      }),
    ).toEqual([
      {
        slot: 'Head',
        name: 'Helm of Tests',
        level: 619,
        quality: 'EPIC',
        enchants: ['Enchanted: +10 Haste'],
        gems: ['Ruby', 'Empty socket'],
      },
    ]);
    expect(parseItems(null)).toEqual([]);
  });

  it('reads the sheet whatever shape a value comes in', () => {
    const stats = parseStats({
      health: 1000,
      power_type: { name: 'Mana' },
      strength: { base: 10, effective: 55 },
      melee_crit: { value: 12.345 },
      spell_crit: { value: 20.06 },
      mastery: { value: 33.33 },
      versatility_damage_done_bonus: 4.44,
    });
    expect(stats).toMatchObject({
      health: 1000,
      powerType: 'Mana',
      strength: 55,
      agility: null,
      crit: 20.1,
      mastery: 33.3,
      versatility: 4.4,
      haste: null,
    });
    expect(parseStats(null)).toBeNull();
  });

  it('takes the talents of the active loadout', () => {
    const [spec] = parseSpecs({
      active_specialization: { name: 'Retribution' },
      specializations: [
        {
          specialization: { name: 'Retribution' },
          loadouts: [
            {
              is_active: false,
              selected_class_talents: [{ tooltip: { talent: { name: 'Old' } } }],
            },
            {
              is_active: true,
              talent_loadout_code: 'CODE',
              selected_class_talents: [{ tooltip: { talent: { name: 'Lay on Hands' } } }],
              selected_spec_talents: [{ tooltip: { talent: { name: 'Blade of Justice' } } }],
            },
          ],
        },
      ],
    });
    expect(spec).toEqual({
      name: 'Retribution',
      active: true,
      talents: ['Lay on Hands', 'Blade of Justice'],
      loadoutCode: 'CODE',
    });
  });

  it('keeps the best run of each dungeon', () => {
    const run = (dungeon: string, level: number, rating: number) => ({
      dungeon: { name: dungeon },
      keystone_level: level,
      duration: 1_500_000,
      is_completed_within_time: true,
      completed_timestamp: 1_790_000_000_000,
      mythic_rating: { rating },
    });
    const mythic = parseMythic(
      { current_mythic_rating: { rating: 100 } },
      {
        mythic_rating: { rating: 1834.6 },
        best_runs: [run('Halls', 7, 180), run('Halls', 9, 220.44), run('Mists', 12, 300)],
      },
    );
    expect(mythic?.rating).toBe(1835);
    expect(mythic?.runs.map((r) => `${r.dungeon} +${r.level} ${r.rating}`)).toEqual([
      'Mists +12 300',
      'Halls +9 220.4',
    ]);
    expect(parseMythic(null, null)).toBeNull();
  });

  it('shows the raids of the newest expansions, newest first', () => {
    const instance = (name: string, killed: number) => ({
      instance: { name },
      modes: [
        { difficulty: { name: 'Heroic' }, progress: { completed_count: killed, total_count: 8 } },
      ],
    });
    const raids = parseRaids({
      expansions: [
        { expansion: { name: 'Old' }, instances: [instance('Ancient', 8)] },
        { expansion: { name: 'Mid' }, instances: [instance('Middle', 3)] },
        { expansion: { name: 'New' }, instances: [instance('First', 8), instance('Second', 2)] },
      ],
    });
    expect(raids.map((raid) => raid.name)).toEqual(['Second', 'First', 'Middle']);
    expect(raids[0].modes).toEqual([{ difficulty: 'Heroic', killed: 2, total: 8 }]);
  });

  it('puts the furthest reputations first and reads old and new professions', () => {
    const reputations = parseReputations({
      reputations: [
        { faction: { name: 'A' }, standing: { name: 'Friendly', value: 100, max: 6000, tier: 4 } },
        { faction: { name: 'B' }, standing: { name: 'Exalted', value: 0, max: 0, tier: 7 } },
        { faction: { name: 'broken' } },
      ],
    });
    expect(reputations.map((r) => r.faction)).toEqual(['B', 'A']);
    expect(
      parseProfessions({
        primaries: [
          {
            profession: { name: 'Mining' },
            tiers: [
              { tier: { name: 'Khaz Algar Mining' }, skill_points: 40, max_skill_points: 100 },
            ],
          },
        ],
        secondaries: [
          { profession: { name: 'Cooking' }, skill_points: 300, max_skill_points: 300 },
        ],
      }),
    ).toEqual([
      {
        name: 'Mining',
        primary: true,
        tiers: [{ name: 'Khaz Algar Mining', skill: 40, max: 100 }],
      },
      { name: 'Cooking', primary: false, tiers: [{ name: 'Cooking', skill: 300, max: 300 }] },
    ]);
  });

  it('names a bracket by the end of its address', () => {
    expect(bracketName('https://eu.api.blizzard.com/x/pvp-bracket/3v3?namespace=profile-eu')).toBe(
      '3v3',
    );
  });
});

describe('fetchDetails', () => {
  it('is empty, not broken, when Blizzard has nothing for the character (Classic)', async () => {
    const details = await fetchDetails(
      { part: async () => null, href: async () => null },
      { name: 'Kat', title: null, faction: 'Alliance', renderUrl: null, guild: null },
    );
    expect(details).toMatchObject({
      faction: 'Alliance',
      items: [],
      stats: null,
      specs: [],
      mythic: null,
      raids: [],
      pvp: null,
      guild: null,
      collections: { mounts: null, pets: null, toys: null, titles: null, quests: null },
    });
  });

  it('finds the character in its guild and reads the rated brackets', async () => {
    const answers: Record<string, unknown> = {
      '/pvp-summary': { honor_level: 12, brackets: [{ href: 'https://x/pvp-bracket/2v2?n=1' }] },
      'https://x/pvp-bracket/2v2?n=1': {
        rating: 1500,
        season_match_statistics: { played: 10, won: 6 },
      },
      'https://x/guild/g?n=1': { name: 'Guild', member_count: 40, achievement_points: 900 },
      'https://x/guild/g/roster?n=1': { members: [{ character: { name: 'Kat' }, rank: 3 }] },
    };
    const details = await fetchDetails(
      {
        part: async <T>(path: string) => (answers[path] as T) ?? null,
        href: async <T>(href: string) => (answers[href] as T) ?? null,
      },
      {
        name: 'kat',
        title: null,
        faction: null,
        renderUrl: null,
        guild: { name: 'Guild', href: 'https://x/guild/g?n=1' },
      },
    );
    expect(details.guild).toEqual({ name: 'Guild', members: 40, achievementPoints: 900, rank: 3 });
    expect(details.pvp).toEqual({
      honorLevel: 12,
      honorableKills: null,
      brackets: [{ bracket: '2v2', rating: 1500, played: 10, won: 6 }],
    });
  });
});

describe('wowNews', () => {
  const base: WowDetails = {
    renderUrl: null,
    title: null,
    faction: null,
    items: [],
    stats: null,
    specs: [],
    mythic: { rating: 1500, runs: [] },
    raids: [
      { expansion: 'E', name: 'Raid', modes: [{ difficulty: 'Heroic', killed: 3, total: 8 }] },
    ],
    pvp: {
      honorLevel: 1,
      honorableKills: 0,
      brackets: [{ bracket: '2v2', rating: 1400, played: 1, won: 1 }],
    },
    collections: { mounts: 100, pets: 50, toys: null, heirlooms: 1, titles: 5, quests: 10 },
    reputations: [],
    professions: [],
    guild: null,
  };

  it('tells what got better', () => {
    const news = wowNews(base, {
      ...base,
      mythic: { rating: 1620, runs: [] },
      raids: [
        { expansion: 'E', name: 'Raid', modes: [{ difficulty: 'Heroic', killed: 4, total: 8 }] },
      ],
      pvp: {
        honorLevel: 1,
        honorableKills: 0,
        brackets: [{ bracket: '2v2', rating: 1450, played: 3, won: 2 }],
      },
      collections: { ...base.collections, mounts: 102, toys: 7 },
    });
    expect(news).toEqual([
      { kind: 'mythic', from: 1500, to: 1620 },
      { kind: 'raid', raid: 'Raid', difficulty: 'Heroic', killed: 4, total: 8 },
      { kind: 'pvp', bracket: '2v2', from: 1400, to: 1450 },
      // Toys were not known before: their first number is not news.
      { kind: 'collection', what: 'mounts', added: 2, total: 102 },
    ]);
  });

  it('says nothing when nothing changed or a number went down', () => {
    expect(wowNews(base, base)).toEqual([]);
    expect(wowNews(base, { ...base, mythic: { rating: 0, runs: [] } })).toEqual([]);
  });
});
