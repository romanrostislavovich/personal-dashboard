import { WowDetails, WowRegion, WowVersion } from '@pd/contracts';
import { fetchDetails } from './wow-details.fetch';

export class BattlenetAuthError extends Error {}
export class WowCharacterNotFoundError extends Error {}
/** No such realm in this region and version of the game; the message lists the ones there are. */
export class WowRealmNotFoundError extends Error {}

export interface WowCharacterRef {
  region: WowRegion;
  version: WowVersion;
  /** The slug of the realm (`gordunni`). */
  realm: string;
  name: string;
}

/**
 * Each version of the game is a namespace of the API: `profile-eu` is the current game,
 * `profile-classicann-eu` — Classic Anniversary, and so on.
 */
const NAMESPACES: Record<WowVersion, string> = {
  retail: '',
  anniversary: 'classicann-',
  era: 'classic1x-',
  progression: 'classic-',
};

export function namespace(
  kind: 'profile' | 'dynamic',
  ref: Pick<WowCharacterRef, 'region' | 'version'>,
): string {
  return `${kind}-${NAMESPACES[ref.version]}${ref.region}`;
}

export interface WowRealm {
  slug: string;
  /** The name in every language Blizzard gives it in. */
  names: string[];
}

/**
 * The realm the user means: by its slug or by its name in any language, whatever the case —
 * "Гордунни", "gordunni" and "Gordunni" are the same realm. `null` — there is no such realm.
 */
export function findRealm(realms: WowRealm[], text: string): WowRealm | null {
  const wanted = text.trim().toLowerCase();
  return (
    realms.find(
      (realm) => realm.slug === wanted || realm.names.some((name) => name.toLowerCase() === wanted),
    ) ?? null
  );
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
  /** `null` for Classic: Blizzard's site has pages only for characters of the current game. */
  profileUrl: string | null;
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

  /**
   * The character with everything about it: the summary (a missing character fails here) and
   * the details, where a part Blizzard does not have is left empty.
   */
  async getCharacter(ref: WowCharacterRef): Promise<{ profile: WowProfile; details: WowDetails }> {
    const [summary, media] = await Promise.all([
      this.get<RawCharacter>(ref, ''),
      this.get<RawMedia>(ref, '/character-media').catch(() => null),
    ]);
    const asset = (key: string) => media?.assets?.find((a) => a.key === key)?.value ?? null;
    const details = await fetchDetails(
      {
        part: (path) => this.get<never>(ref, path).catch(() => null),
        href: (href) => this.getHref<never>(ref.region, href).catch(() => null),
      },
      {
        name: summary.name,
        title: summary.active_title?.display_string?.replace('{name}', summary.name) ?? null,
        faction: summary.faction?.name ?? null,
        renderUrl: asset('main-raw') ?? asset('main') ?? asset('inset'),
        guild: summary.guild
          ? { name: summary.guild.name, href: summary.guild.key?.href ?? null }
          : null,
      },
    );
    return { profile: this.toProfile(ref, summary, asset('avatar')), details };
  }

  /** The price of the WoW Token in gold, as the auction house of the region has it now. */
  async getTokenPrice(region: WowRegion): Promise<{ price: number; updatedAt: Date } | null> {
    const query = new URLSearchParams({ namespace: `dynamic-${region}` });
    const raw = await this.getHref<{ price?: number; last_updated_timestamp?: number }>(
      region,
      `https://${region}.api.blizzard.com/data/wow/token/index?${query}`,
    ).catch(() => null);
    return raw?.price
      ? {
          // Blizzard counts in copper: 10,000 to a gold coin.
          price: Math.round(raw.price / 10_000),
          updatedAt: new Date(raw.last_updated_timestamp ?? Date.now()),
        }
      : null;
  }

  private toProfile(
    ref: WowCharacterRef,
    summary: RawCharacter,
    avatarUrl: string | null,
  ): WowProfile {
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
      // Classic Era and Anniversary have no achievements.
      achievementPoints: summary.achievement_points ?? 0,
      avatarUrl,
      profileUrl:
        ref.version === 'retail'
          ? `https://worldofwarcraft.blizzard.com/character/${ref.region}/${ref.realm}/${ref.name.toLowerCase()}`
          : null,
      lastLoginAt: summary.last_login_timestamp
        ? new Date(summary.last_login_timestamp).toISOString()
        : null,
    };
  }

  /**
   * Completed achievements only (incomplete ones have no completed_timestamp). A Classic version
   * without achievements answers 404 — that is "none", not a missing character.
   */
  async getCompletedAchievements(ref: WowCharacterRef): Promise<WowCompletedAchievement[]> {
    const data = await this.get<RawAchievements>(ref, '/achievements').catch((error) => {
      if (ref.version !== 'retail' && error instanceof WowCharacterNotFoundError) {
        return { achievements: [] };
      }
      throw error;
    });
    return (data.achievements ?? [])
      .filter((a) => a.completed_timestamp)
      .map((a) => ({
        id: a.id,
        name: a.achievement.name,
        completedAt: new Date(a.completed_timestamp as number),
      }));
  }

  /**
   * The realm by what the user typed — its name as the game shows it, or its slug. Throws
   * `WowRealmNotFoundError` naming the realms this region and version have.
   */
  async resolveRealm(
    ref: Pick<WowCharacterRef, 'region' | 'version'>,
    text: string,
  ): Promise<{ slug: string; name: string }> {
    // Without a locale Blizzard gives the name in every language at once.
    const query = new URLSearchParams({ namespace: namespace('dynamic', ref) });
    const url = `https://${ref.region}.api.blizzard.com/data/wow/realm/index?${query}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${await this.accessToken()}` },
    });
    if (!response.ok) {
      throw new Error(`Battle.net API ${response.status}: realm index`);
    }
    const { realms } = (await response.json()) as RawRealmIndex;
    const language = LOCALES[ref.region];
    const known = realms.map((realm) => ({
      slug: realm.slug,
      names: typeof realm.name === 'string' ? [realm.name] : Object.values(realm.name),
      shown: typeof realm.name === 'string' ? realm.name : (realm.name[language] ?? realm.slug),
    }));
    const found = findRealm(known, text);
    if (!found) {
      const names = known.map((realm) => realm.shown).sort((a, b) => a.localeCompare(b));
      throw new WowRealmNotFoundError(`No realm "${text}" here. Realms: ${names.join(', ')}`);
    }
    return {
      slug: found.slug,
      name: known.find((r) => r.slug === found.slug)?.shown ?? found.slug,
    };
  }

  /** An address from one of Blizzard's own answers; the language of the region is added. */
  private async getHref<T>(region: WowRegion, href: string): Promise<T> {
    const url = new URL(href);
    url.searchParams.set('locale', LOCALES[region]);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${await this.accessToken()}` },
    });
    if (!response.ok) {
      throw new Error(`Battle.net API ${response.status}: ${url.pathname}`);
    }
    return (await response.json()) as T;
  }

  private async get<T>(ref: WowCharacterRef, path: string): Promise<T> {
    const name = encodeURIComponent(ref.name.toLowerCase());
    const query = new URLSearchParams({
      namespace: namespace('profile', ref),
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
  guild?: { name: string; key?: { href?: string } };
  faction?: { name?: string };
  /** `{name} the Patient` */
  active_title?: { display_string?: string };
  equipped_item_level?: number;
  achievement_points?: number;
  last_login_timestamp?: number;
}

interface RawMedia {
  assets?: { key: string; value: string }[];
}

interface RawRealmIndex {
  realms: { slug: string; name: string | Record<string, string> }[];
}

interface RawAchievements {
  achievements?: {
    id: number;
    achievement: { name: string };
    completed_timestamp?: number;
  }[];
}
