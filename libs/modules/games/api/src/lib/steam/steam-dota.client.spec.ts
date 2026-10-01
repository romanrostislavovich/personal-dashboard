import { listedMatch, matchDetails } from './steam-dota.client';

const ME = 105248644;

describe('listedMatch', () => {
  it('takes the hero of the account from the players of the match', () => {
    const [match] = listedMatch(
      {
        match_id: 7001,
        start_time: 1_790_000_000,
        lobby_type: 7,
        players: [
          { account_id: 4294967295, player_slot: 0, hero_id: 1 },
          { account_id: ME, player_slot: 130, hero_id: 14 },
        ],
      },
      ME,
    );
    expect(match).toEqual({
      matchId: 7001,
      heroId: 14,
      startedAt: new Date(1_790_000_000 * 1000),
      lobbyType: 7,
    });
  });

  it('skips a match the account is not in or left before picking a hero', () => {
    const base = { match_id: 1, start_time: 1 };
    expect(
      listedMatch({ ...base, players: [{ account_id: 1, player_slot: 0, hero_id: 5 }] }, ME),
    ).toEqual([]);
    expect(
      listedMatch({ ...base, players: [{ account_id: ME, player_slot: 0, hero_id: 0 }] }, ME),
    ).toEqual([]);
  });
});

describe('matchDetails', () => {
  const player = {
    account_id: ME,
    player_slot: 130,
    kills: 9,
    deaths: 2,
    assists: 14,
    gold_per_min: 612,
    xp_per_min: 701,
    last_hits: 180,
    denies: 7,
    hero_damage: 21000,
    tower_damage: 3400,
    hero_healing: 0,
    leaver_status: 0,
  };

  it('reads the result from the side the player was on', () => {
    // Slot 130 is Dire: a Dire win when Radiant did not win.
    const details = matchDetails(
      { radiant_win: false, duration: 1830, game_mode: 23, lobby_type: 0, players: [player] },
      ME,
    );
    expect(details).toMatchObject({
      won: true,
      kills: 9,
      deaths: 2,
      assists: 14,
      durationSec: 1830,
      gameMode: 23,
      goldPerMin: 612,
      heroDamage: 21000,
    });
    expect(matchDetails({ radiant_win: true, duration: 1, players: [player] }, ME)?.won).toBe(
      false,
    );
  });

  it('gives nothing when Steam has no details or the player is not in them', () => {
    expect(matchDetails({ error: 'Match ID not found' }, ME)).toBeNull();
    expect(
      matchDetails({ radiant_win: true, players: [{ ...player, account_id: 1 }] }, ME),
    ).toBeNull();
    expect(matchDetails({ players: [player] }, ME)).toBeNull();
  });
});
