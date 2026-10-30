import {LinksService} from '@pd/api-core';
import {configureFieldEncryption} from '@pd/api-core/schema';
import {sql} from 'drizzle-orm';
import {drizzle, NodePgDatabase} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {Pool} from 'pg';
import {MovieQuestionService} from './movie-question.service';
import {MoviesMatchService} from './movies-match.service';
import {MoviesLinks} from './movies.links';
import {MoviesService} from './movies.service';

/** Runs against the generated migrations, like the other *.db.spec.ts. */
const ADMIN_URL = process.env['TEST_DATABASE_URL'];
const MIGRATIONS = join(
  import.meta.dirname,
  '../../../../../../apps/api/migrations',
);
const DB_NAME = `movies_test_${process.pid}`;

/** The owner's evening of 2026-10-25 (Warsaw, UTC+1): Moana on kinogo.ec from 21:06 to 22:56. */
const moana = (watchedSeconds: number, endedAt: string) => ({
  id: '11111111-1111-4111-8111-111111111111',
  site: 'kinogo.ec',
  hints: {
    pageTitle: 'Моана (2026) смотреть онлайн бесплатно в хорошем качестве HD',
  },
  startedAt: '2026-10-25T20:06:00Z',
  endedAt,
  watchedSeconds,
  positionSeconds: watchedSeconds,
  durationSeconds: 6000,
});

describe.skipIf(!ADMIN_URL)('movies', {timeout: 60_000}, () => {
  let admin: Pool;
  let pool: Pool;
  let db: NodePgDatabase;
  let movies: MoviesService;
  let match: MoviesMatchService;
  let links: LinksService;
  const userId = randomUUID();
  const fetchMock = vi.fn();
  let key: string | null = 'a'.repeat(32);

  beforeAll(async () => {
    configureFieldEncryption('movies-database-test-encryption-key');
    admin = new Pool({connectionString: ADMIN_URL});
    await admin.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${DB_NAME}`);
    const url = new URL(ADMIN_URL as string);
    url.pathname = `/${DB_NAME}`;
    pool = new Pool({connectionString: url.toString()});
    pool.on('error', () => undefined);
    db = drizzle({client: pool, casing: 'snake_case'});
    await migrate(db, {migrationsFolder: MIGRATIONS});
    await db.execute(sql`INSERT INTO users (id, email, password_hash, display_name, locale, time_zone)
      VALUES (${userId}, 'movies@test', 'hash', 'Test', 'ru', 'Europe/Warsaw')`);
    const secrets = {
      get: async () => key,
      has: async () => !!key,
      set: async () => undefined,
      delete: async () => undefined,
    };
    const users = {
      findById: async () => ({locale: 'ru', timeZone: 'Europe/Warsaw'}),
      timeZoneOf: (user: {timeZone: string}) => user.timeZone,
    };
    movies = new MoviesService(db as never, secrets as never, users as never);
    match = new MoviesMatchService(
      db as never,
      secrets as never,
      users as never,
      movies,
    );
    links = new LinksService();
    new MoviesLinks(db as never, links, users as never).onModuleInit();
  }, 60_000);

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation(async (url: URL) => {
      const path = url.pathname;
      if (path.endsWith('/search/multi')) {
        expect(url.searchParams.get('query')).toBe('Моана');
        expect(url.searchParams.get('language')).toBe('ru-RU');
        return Response.json({
          results: [
            {
              id: 277834,
              media_type: 'movie',
              title: 'Моана',
              release_date: '2016-11-23',
            },
            {
              id: 1167307,
              media_type: 'movie',
              title: 'Моана',
              release_date: '2026-07-09',
              poster_path: '/m.jpg',
            },
          ],
        });
      }
      if (path.endsWith('/movie/1167307')) {
        return Response.json({
          id: 1167307,
          title: 'Моана',
          original_title: 'Moana',
          release_date: '2026-07-09',
          poster_path: '/m.jpg',
          runtime: 100,
          genres: [{name: 'семейный'}],
        });
      }
      return new Response('{}', {status: 404});
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  afterAll(async () => {
    await pool?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
    await admin?.end();
  });

  it('finds the film of a pirate page in TMDB and counts it seen once most of it played', async () => {
    // Half an hour in: kept, found, not seen yet.
    await movies.ingest(userId, [moana(1800, '2026-10-25T20:36:00Z')]);
    await match.resolvePending();
    let [title] = await movies.titles(userId, 'history');
    expect(title).toMatchObject({
      tmdbId: 1167307,
      title: 'Моана',
      originalTitle: 'Moana',
      year: 2026,
      runtimeMinutes: 100,
      watchedOn: null,
      watchedSeconds: 1800,
    });
    expect(title.posterUrl).toBe('https://image.tmdb.org/t/p/w185/m.jpg');

    // The same view sent again as it grew: updated, not added, and now seen (100 of 100 min).
    await movies.ingest(userId, [moana(6000, '2026-10-25T21:56:00Z')]);
    [title] = await movies.titles(userId, 'history');
    expect(title).toMatchObject({
      watchedSeconds: 6000,
      watchedOn: '2026-10-25',
    });
    expect(await movies.views(userId, {})).toHaveLength(1);

    // A second view of the same name is found among the user's own, without TMDB.
    fetchMock.mockClear();
    await movies.ingest(userId, [
      {
        ...moana(900, '2026-10-26T20:15:00Z'),
        id: randomUUID(),
        startedAt: '2026-10-26T20:00:00Z',
      },
    ]);
    await match.resolvePending();
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await movies.titles(userId, 'history'))[0].watchedSeconds).toBe(
      6900,
    );
  });

  it('asks how the film was an hour after it ends, once; the rating and a few words are kept', async () => {
    const sent: {
      title: string;
      actions?: {label: string; action: string; newRow?: boolean}[];
    }[] = [];
    const notifications = {
      send: async (_: string, n: (typeof sent)[number]) => void sent.push(n),
    };
    const users = {findById: async () => ({id: userId, locale: 'ru'})};
    const question = new MovieQuestionService(
      db as never,
      notifications as never,
      users as never,
    );
    // Moana's last view (the second evening) ended at 20:15 UTC: not yet at 20:45, asked at 21:20, not twice.
    await question.askDue(new Date('2026-10-26T20:45:00Z'));
    expect(sent).toHaveLength(0);
    await question.askDue(new Date('2026-10-26T21:20:00Z'));
    await question.askDue(new Date('2026-10-26T21:25:00Z'));
    expect(sent.map(n => n.title)).toEqual(['🎬 Как тебе «Моана»?']);
    const buttons = sent[0].actions ?? [];
    expect(buttons.map(b => b.label)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '10',
      'Не досмотрел',
    ]);
    expect(buttons.filter(b => b.newRow).map(b => b.label)).toEqual([
      '1',
      '6',
      'Не досмотрел',
    ]);

    const eight = buttons[7].action.split(':').slice(1).join(':');
    const reply = await question.answer(
      {id: userId, locale: 'ru'} as never,
      eight,
    );
    expect(typeof reply === 'string' ? reply : reply.reply).toContain('8/10');
    if (typeof reply !== 'string') {
      await reply.expectText(
        {id: userId} as never,
        'Очень красивая, музыка супер',
      );
    }
    const [title] = await movies.titles(userId, 'history');
    expect(title).toMatchObject({
      rating: 8,
      note: 'Очень красивая, музыка супер',
    });
  });

  it('gives Links the hours of an evening, the late part of it with them', async () => {
    const metrics = await links.dailyMetrics(userId, {
      from: '2026-10-25',
      to: '2026-10-26',
    });
    const day = (metricKey: string, on: string) =>
      metrics
        .find(metric => metric.key === metricKey)
        ?.days.find(d => d.day === on)?.value;
    expect(day('movies.hours', '2026-10-25')).toBeCloseTo(6000 / 3600, 2);
    expect(day('movies.lateHours', '2026-10-25')).toBe(0);
    expect(day('movies.hours', '2026-10-26')).toBe(0.25);
  });

  it('keeps a title as the page named it without a key, and leaves an ignored site alone', async () => {
    key = null;
    const id = randomUUID();
    await movies.ingest(userId, [
      {
        ...moana(1200, '2026-10-27T20:30:00Z'),
        id,
        site: 'lordfilm.org',
        hints: {pageTitle: 'Сериал Сёгун 1 сезон 3 серия смотреть онлайн'},
        startedAt: '2026-10-27T20:00:00Z',
        durationSeconds: 3500,
      },
    ]);
    await match.resolvePending();
    expect(fetchMock).not.toHaveBeenCalled();
    const shogun = (await movies.titles(userId, 'history')).find(
      t => t.title === 'Сёгун',
    );
    expect(shogun).toMatchObject({
      tmdbId: null,
      kind: 'tv',
      episodes: 1,
      lastEpisode: {season: 1, episode: 3},
    });

    await movies.ignoreSite(userId, 'lordfilm.org');
    expect((await movies.views(userId, {})).some(view => view.id === id)).toBe(
      false,
    );
    await movies.ingest(userId, [
      {
        ...moana(60, '2026-10-27T21:00:00Z'),
        id: randomUUID(),
        site: 'lordfilm.org',
      },
    ]);
    expect(
      (await movies.views(userId, {})).every(
        view => view.site !== 'lordfilm.org',
      ),
    ).toBe(true);
  });
});
