import { WowRegion } from '@pd/contracts';

export class BattlenetAuthError extends Error {}
export class WowCharacterNotFoundError extends Error {}

export interface WowCharacterRef {
  region: WowRegion;
  realm: string;
  name: string;
}

export interface WowProfile {
  name: string;
  realm: string;
  level: number;
  /** Blizzard class id (1 Warrior … 13 Evoker): the class colour on the page. */
  classId: number | null;
  className: string;
  raceName: string;
  specName: string | null;
  guild: string | null;
  itemLevel: number | null;
  achievementPoints: number;
  avatarUrl: string | null;
  profileUrl: string;
  lastLoginAt: string | null;
}

export interface WowCompletedAchievement {
  id: number;
  name: string;
  completedAt: Date;
}

/** Response language: Russian for the European region. */
const LOCALES: Record<WowRegion, string> = { eu: 'ru_RU', us: 'en_US', kr: 'ko_KR', tw: 'zh_TW' };

/**
 * Battle.net API (World of Warcraft Profile API). Access with app keys
 * from develop.battle.net (client credentials) — no need to sign in with a Blizzard account,
 * character data is public.
 */
export class BattlenetClient {
  private token: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {}

  /** Key check: just obtain a token. */
  async verify(): Promise<void> {
    await this.accessToken();
  }

  async getProfile(ref: WowCharacterRef): Promise<WowProfile> {
    const [summary, media] = await Promise.all([
      this.get<RawCharacter>(ref, ''),
      this.get<RawMedia>(ref, '/character-media').catch(() => null),
    ]);
    return {
      name: summary.name,
      realm: summary.realm.name,
      level: summary.level,
      classId: summary.character_class.id,
      className: summary.character_class.name,
      raceName: summary.race.name,
      specName: summary.active_spec?.name ?? null,
      guild: summary.guild?.name ?? null,
      itemLevel: summary.equipped_item_level ?? null,
      achievementPoints: summary.achievement_points,
      avatarUrl: media?.assets?.find((a) => a.key === 'avatar')?.value ?? null,
      profileUrl: `https://worldofwarcraft.blizzard.com/character/${ref.region}/${ref.realm}/${ref.name.toLowerCase()}`,
      lastLoginAt: summary.last_login_timestamp
        ? new Date(summary.last_login_timestamp).toISOString()
        : null,
    };
  }

  /** Completed achievements only (incomplete ones have no completed_timestamp). */
  async getCompletedAchievements(ref: WowCharacterRef): Promise<WowCompletedAchievement[]> {
    const data = await this.get<RawAchievements>(ref, '/achievements');
    return data.achievements
      .filter((a) => a.completed_timestamp)
      .map((a) => ({
        id: a.id,
        name: a.achievement.name,
        completedAt: new Date(a.completed_timestamp as number),
      }));
  }

  private async get<T>(ref: WowCharacterRef, path: string): Promise<T> {
    const name = encodeURIComponent(ref.name.toLowerCase());
    const query = new URLSearchParams({
      namespace: `profile-${ref.region}`,
      locale: LOCALES[ref.region],
    });
    const url = `https://${ref.region}.api.blizzard.com/profile/wow/character/${ref.realm}/${name}${path}?${query}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${await this.accessToken()}` },
    });
    if (response.status === 404) {
      throw new WowCharacterNotFoundError(`Character ${ref.name}-${ref.realm} not found`);
    }
    if (!response.ok) {
      throw new Error(`Battle.net API ${response.status}: ${path || 'character'}`);
    }
    return (await response.json()) as T;
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now()) {
      return this.token.value;
    }
    const response = await fetch('https://oauth.battle.net/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({ grant_type: 'client_credentials' }),
    });
    if (response.status === 400 || response.status === 401) {
      throw new BattlenetAuthError('Invalid Battle.net client credentials');
    }
    if (!response.ok) {
      throw new Error(`Battle.net OAuth ${response.status}`);
    }
    const data = (await response.json()) as { access_token: string; expires_in: number };
    // Refresh the token a minute before it expires.
    this.token = {
      value: data.access_token,
      expiresAt: Date.now() + (data.expires_in - 60) * 1000,
    };
    return this.token.value;
  }
}

// --- Raw Battle.net responses (only the fields we use) ---

interface RawCharacter {
  name: string;
  level: number;
  realm: { name: string };
  character_class: { id: number; name: string };
  race: { name: string };
  active_spec?: { name: string };
  guild?: { name: string };
  equipped_item_level?: number;
  achievement_points: number;
  last_login_timestamp?: number;
}

interface RawMedia {
  assets?: { key: string; value: string }[];
}

interface RawAchievements {
  achievements: {
    id: number;
    achievement: { name: string };
    completed_timestamp?: number;
  }[];
}
