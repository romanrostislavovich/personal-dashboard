import {DailyMetric, LocalDate} from '@pd/contracts';
import {sql} from 'drizzle-orm';
import {drizzle, NodePgDatabase} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {Pool} from 'pg';
import {daysOf, shift} from '../daily-series';
import {InsightsService} from './insights.service';
import {QuestionsService} from './questions.service';

/** Needs PostgreSQL, see `sync-store.db.spec.ts` for how to run it. */
const ADMIN_URL = process.env['TEST_DATABASE_URL'];
const MIGRATIONS = join(
  import.meta.dirname,
  '../../../../../../../apps/api/migrations',
);
const DB_NAME = `links_questions_test_${process.pid}`;

const TODAY = new Date().toISOString().slice(0, 10);
const DAYS = daysOf({from: shift(TODAY, -120), to: shift(TODAY, -1)});

function metric(
  key: string,
  value: (day: LocalDate, index: number) => number,
  more: Partial<DailyMetric> = {},
): DailyMetric {
  return {
    key,
    module: key.split('.')[0],
    labelKey: key,
    unit: 'hours',
    days: DAYS.map((day, index) => ({day, value: value(day, index)})),
    ...more,
  };
}

/** Late phone on odd days, a gym habit skipped the day after; the interruptions cost deep work. */
const LIFE: DailyMetric[] = [
  metric('activity.phone.night', (_, index) => (index % 2 ? 2 : 0.1)),
  metric('habits.gym', (_, index) => (index % 2 === 0 && index > 0 ? 0 : 1), {
    unit: 'count',
  }),
  metric('activity.index.focusInterruptions', (_, index) => index % 6),
  metric('activity.index.deepWork', (_, index) => 4 - (index % 6) / 2),
  metric('weather.rain', (_, index) => index % 3, {unit: 'count'}),
];

describe.skipIf(!ADMIN_URL)('QuestionsService and InsightsService', () => {
  let admin: Pool;
  let pool: Pool;
  let db: NodePgDatabase;
  let aiReply = '[]';
  let aiConfigured = true;
  let hidden: string[] = [];
  const sentToAi: string[] = [];

  const ai = {
    isConfigured: async () => aiConfigured,
    hiddenFromShared: async () => hidden,
    complete: async (_user: string, _instruction: string, content: string) => {
      sentToAi.push(content);
      // The week's findings come as an array: as many sentences back, the first one given.
      if (content.startsWith('[') && aiReply.startsWith('[')) {
        const first = JSON.parse(aiReply)[0];
        return JSON.stringify(
          (JSON.parse(content) as unknown[]).map((_, index) =>
            index ? `Вывод ${index}` : first,
          ),
        );
      }
      return aiReply;
    },
  };
  const users = {
    findById: async () => ({locale: 'ru'}),
    timeZoneOf: () => 'UTC',
    findAll: async () => [],
  };
  const questions = () =>
    new QuestionsService(
      db as never,
      {dailyMetrics: async () => LIFE, periodsBetween: async () => []} as never,
      {hours: async () => ({metrics: [], events: []})} as never,
      users as never,
      ai as never,
    );
  const insights = (asked = questions(), syncClient = false) =>
    new InsightsService(
      {get: () => (syncClient ? 'client' : 'off')} as never,
      db as never,
      {
        correlations: async () => ({
          correlations: [
            {
              a: 'activity.index.focusInterruptions',
              b: 'activity.index.deepWork',
              lag: 0,
              strong: true,
            },
          ],
        }),
      } as never,
      {
        hourAfter: async () => ({events: [], outcomes: [], results: []}),
      } as never,
      {list: async () => ({changes: []})} as never,
      asked,
      users as never,
      ai as never,
      {register: () => undefined} as never,
      {register: () => undefined} as never,
    );

  const addUser = async () => {
    const id = randomUUID();
    await db.execute(sql`INSERT INTO users (id, email, password_hash, display_name, locale)
      VALUES (${id}, ${`${id}@test`}, 'hash', 'Test', 'ru')`);
    return id;
  };

  beforeAll(async () => {
    admin = new Pool({connectionString: ADMIN_URL});
    await admin.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${DB_NAME}`);
    const url = new URL(ADMIN_URL as string);
    url.pathname = `/${DB_NAME}`;
    pool = new Pool({connectionString: url.toString()});
    pool.on('error', () => undefined);
    db = drizzle({client: pool, casing: 'snake_case'});
    await migrate(db, {migrationsFolder: MIGRATIONS});
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
    await admin?.end();
  });

  it('answers the built-in cards, the night phone for each habit', async () => {
    const user = await addUser();
    const {cards} = await questions().list(user);
    const night = cards.find(
      card => card.question.id === 'builtin.nightPhone.habits.gym',
    );
    expect(night?.answer.status).toBe('answered');
    expect(night?.answer.strong).toBe(true);
    expect(night?.answer.difference).toBeLessThan(0);
    // Not every user has the places: that card says the number is missing.
    expect(
      cards.find(card => card.question.id === 'builtin.home.mood')?.answer
        .status,
    ).toBe('missing');
  });

  it("keeps the user's own questions, of their numbers only, and not another's", async () => {
    const user = await addUser();
    const other = await addUser();
    const service = questions();
    const added = await service.add(user, {
      cause: 'weather.rain',
      effect: 'activity.index.deepWork',
      when: 'nextDay',
      condition: {key: 'activity.phone.night', high: true},
    });
    await expect(
      service.add(user, {
        cause: 'made.up',
        effect: 'tasks.done',
        when: 'sameDay',
      }),
    ).rejects.toThrow();
    const own = (await service.list(user)).cards.filter(
      card => !card.question.builtIn,
    );
    expect(own.map(card => card.question.id)).toEqual([added.id]);
    expect(own[0].answer.condition).not.toBeNull();
    expect(await service.ownCount(other)).toBe(0);
    await expect(service.remove(other, added.id)).rejects.toThrow();
    await service.remove(user, added.id);
    expect(await service.ownCount(user)).toBe(0);
  });

  it('turns words into a card through the AI, checked against the numbers', async () => {
    const user = await addUser();
    aiReply =
      'Sure: {"cause": "activity.phone.night", "effect": "habits.gym", "when": "nextDay"}';
    expect(await questions().draft(user, 'телефон ночью и спортзал')).toEqual({
      cause: 'activity.phone.night',
      effect: 'habits.gym',
      when: 'nextDay',
      title: 'телефон ночью и спортзал',
    });
    aiReply = '{"cause": "made.up", "effect": "habits.gym", "when": "nextDay"}';
    await expect(questions().draft(user, 'что-то')).rejects.toThrow();
  });

  it("finds the week's insights, worded by the AI, and keeps them once an hour", async () => {
    const user = await addUser();
    aiReply = '["Чем больше прерываний, тем меньше глубокой работы."]';
    const service = insights();
    await service.make(user);
    const {insights: found, week} = await service.list(user);
    expect(week).not.toBeNull();
    expect(found[0].fact.kind).toBe('pair');
    expect(found[0].text).toContain('прерываний');
    expect(await service.owns(user, found[0].id)).toBe(true);
    expect(await service.owns(await addUser(), found[0].id)).toBe(false);
    // Asked again at once: the same findings, no second word to the AI.
    const asked = sentToAi.length;
    await service.refresh(user);
    expect(sentToAi.length).toBe(asked);
    expect((await service.list(user)).insights[0].id).toBe(found[0].id);
  });

  it('sends the AI nothing of the hidden sections, and words nothing without one', async () => {
    const user = await addUser();
    hidden = ['activity'];
    const asked = sentToAi.length;
    await insights().make(user);
    expect(sentToAi.length).toBe(asked);
    expect((await insights().list(user)).insights[0].text).toBeNull();
    hidden = [];
    aiConfigured = false;
    const other = await addUser();
    await insights().make(other);
    expect((await insights().list(other)).insights[0].text).toBeNull();
    aiConfigured = true;
  });

  it('makes none on a sync client', async () => {
    const user = await addUser();
    await insights(questions(), true).refresh(user);
    expect((await insights().list(user)).insights).toEqual([]);
  });
});
