import {Inject, Injectable, OnModuleInit} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {
  CorrelationMetric,
  InsightFact,
  LinksInsight,
  LinksInsights,
  LocalDate,
  QuestionNumber,
  zonedDateTime,
} from '@pd/contracts';
import {and, asc, desc, eq, sql} from 'drizzle-orm';
import {AiService} from '../../ai/ai.service';
import {MorningDigestService} from '../../ai/morning-digest.service';
import {AppConfig} from '../../config/env';
import {DB, Database} from '../../database/database.module';
import {forEachUser} from '../../scheduler/for-each-user';
import {SchedulerService} from '../../scheduler/scheduler.service';
import {ServerActions} from '../../sync/server-actions';
import {UsersService} from '../../users/users.service';
import {ChangePointsService} from '../change-points.service';
import {shift} from '../daily-series';
import {HoursService} from '../hours/hours.service';
import {ProjectOverviewService} from '../project-overview.service';
import {linksInsights} from '../links.schema';
import {QuestionsService} from './questions.service';

/** The days the links of the week are looked for in. */
const PAIR_DAYS = 180;
/** The findings of a week, at most, and of each kind. */
const MAX_INSIGHTS = 8;
const MAX_PAIRS = 4;
const PAIRS_LOOKED_AT = 12;
const MAX_AFTER = 2;
const MAX_CHANGES = 2;
const MAX_QUESTIONS = 2;
/** A change this fresh is news of the week. */
const FRESH_CHANGE_DAYS = 28;
/** Looked for again sooner than this, the week's findings stay as they are (the AI costs). */
const REFRESH_MS = 3_600_000;
/** The week's findings are made on the user's Monday from this hour on. */
const MONDAY_HOUR = 5;
/** The page's button, run on the server for a sync client (docs/sync.md). */
export const INSIGHTS_REFRESH = 'life.insights-refresh';
/** The night's numbers: on the same day they come before it (last night's sleep). */
const NIGHT = [
  'health.band.sleep',
  'health.band.deep',
  'health.band.rem',
  'health.band.light',
  'health.band.awake',
  'health.band.bedtime',
  'health.sleep',
];
/** Numbers whose keys carry the user's own words (diary tags): the AI gets them unnamed. */
const UNNAMED_FOR_AI = ['diary.tag.'];

const WORDING_INSTRUCTION =
  "You word a person's findings about their own life, found by a statistics engine from their " +
  'own numbers. For each finding write one calm sentence in LANGUAGE, as a person would say it: ' +
  'name the numbers in plain words (they come as keys: activity.phone.night is the phone at ' +
  'night, tasks.done — tasks done, diary.mood — the mood 1–5; "a diary tag" is one of their own ' +
  'diary tags), tell the difference with its numbers and on how many days or times it was seen; ' +
  '"goes with", never "causes" or advice. If `holds` says a link does not hold within weekends, ' +
  'rain, illness or travel, say it may be that. `pair`: on the days the cause is above ' +
  '`threshold` the effect (the same or the next day) averages `more` against `less`. `after`: in ' +
  'the hour after the event the number averages `after` against `usual` in the same hours without ' +
  'it. `change`: the number moved from `before` to `after` since `day`. `question`: the answer to ' +
  'their own question, like a pair. Answer with a JSON array of the sentences only, in the same ' +
  'order.';

type Row = typeof linksInsights.$inferSelect;

/**
 * The week's findings (Links v2's insight cards): on the user's Monday the strongest of what the
 * engine found — links of the days, the hour after an event, fresh changes, answered questions —
 * each checked against weekends, rain, illness and travel, worded by the AI from keys and
 * numbers only (never texts or places; diary tags unnamed), and kept for the week; Home shows
 * one a day, the Monday digest tells them. Made by the server only: a sync client asks it.
 */
@Injectable()
export class InsightsService implements OnModuleInit {
  private readonly isSyncClient: boolean;
  /** The last look per user: the button runs it once an hour, found something or not. */
  private readonly looked = new Map<string, number>();

  constructor(
    @Inject(ConfigService) config: AppConfig,
    @Inject(DB) private readonly db: Database,
    private readonly overviews: ProjectOverviewService,
    private readonly hours: HoursService,
    private readonly changes: ChangePointsService,
    private readonly questions: QuestionsService,
    private readonly users: UsersService,
    private readonly ai: AiService,
    private readonly scheduler: SchedulerService,
    private readonly digest: MorningDigestService,
    private readonly actions: ServerActions,
  ) {
    this.isSyncClient = config.get('SYNC_MODE', {infer: true}) === 'client';
  }

  onModuleInit(): void {
    // Hourly, in each user's own time: their Monday morning comes at its own hour.
    this.scheduler.register({
      name: 'links.insights',
      cron: '35 * * * *',
      handler: async () =>
        forEachUser('links.insights', await this.users.findAll(), user =>
          this.makeIfDue(user.id),
        ),
    });
    this.actions.register(INSIGHTS_REFRESH, userId => this.refresh(userId));
    this.digest.register({
      id: 'life.insights',
      module: 'life',
      description:
        "This week's findings about the user's own life (Links → Insights), each already a " +
        'sentence (`text`) or the bare finding (`fact`). Tell the two or three most telling in a ' +
        'few calm words, as "goes with", and that Links shows the proof of each.',
      collect: userId => this.digestFacts(userId),
    });
  }

  /** The latest week's findings, and the one of today (by the user's own day). */
  async list(userId: string, now = new Date()): Promise<LinksInsights> {
    const rows = await this.latest(userId);
    const today = await this.todayOf(userId, now);
    const day = Math.floor(Date.parse(`${today}T00:00:00Z`) / 86_400_000);
    return {
      week: rows[0]?.week ?? null,
      insights: rows.map(toInsight),
      today: rows.length ? day % rows.length : 0,
    };
  }

  /** Looks for this week's findings now (the page's button), at most once an hour. */
  async refresh(userId: string, now = new Date()): Promise<void> {
    const last = this.looked.get(userId);
    if (last === undefined || now.getTime() - last >= REFRESH_MS) {
      await this.make(userId, now);
    }
  }

  /** Whether a finding of this key is the user's own (an opened one counts once). */
  async owns(userId: string, key: string): Promise<boolean> {
    const [row] = await this.db
      .select({id: linksInsights.id})
      .from(linksInsights)
      .where(and(eq(linksInsights.userId, userId), eq(linksInsights.key, key)))
      .limit(1);
    return Boolean(row);
  }

  /** The job's: the findings of the user's week, on their Monday morning, once. */
  async makeIfDue(userId: string, now = new Date()): Promise<void> {
    const local = zonedDateTime(now, await this.timeZoneOf(userId));
    const monday =
      new Date(`${local.date}T12:00:00Z`).getUTCDay() === 1 &&
      Number(local.time.slice(0, 2)) >= MONDAY_HOUR;
    if (monday && !(await this.hasWeek(userId, mondayOf(local.date)))) {
      await this.make(userId, now);
    }
  }

  /**
   * Finds, words and keeps the week's findings in place of the week's earlier ones; one at a
   * time for a user (the job and the button at once would keep both).
   */
  async make(userId: string, now = new Date()): Promise<void> {
    if (this.isSyncClient) {
      return;
    }
    this.looked.set(userId, now.getTime());
    const user = await this.users.findById(userId);
    const today = zonedDateTime(now, this.users.timeZoneOf(user)).date;
    const week = mondayOf(today);
    const facts = (await this.find(userId, today)).slice(0, MAX_INSIGHTS);
    const texts = await this.word(userId, user?.locale ?? 'en', facts);
    await this.db.transaction(async tx => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`links.insights:${userId}`}))`,
      );
      await tx
        .delete(linksInsights)
        .where(
          and(eq(linksInsights.userId, userId), eq(linksInsights.week, week)),
        );
      if (facts.length) {
        await tx.insert(linksInsights).values(
          facts.map((fact, position) => ({
            userId,
            week,
            key: keyOf(fact, week),
            position,
            fact,
            text: texts[position] ?? null,
          })),
        );
      }
    });
  }

  /**
   * The week's findings for the Monday digest (made now if the job has not yet, on the server);
   * the sections hidden from the AI stay out.
   */
  async digestFacts(userId: string, now = new Date()): Promise<unknown> {
    const today = await this.todayOf(userId, now);
    if (new Date(`${today}T12:00:00Z`).getUTCDay() !== 1) {
      return null;
    }
    const week = mondayOf(today);
    if (!(await this.hasWeek(userId, week))) {
      await this.make(userId, now);
    }
    const hidden = await this.ai.hiddenFromShared(userId);
    const rows = (await this.latest(userId)).filter(
      row =>
        row.week === week &&
        !modulesOf(row.fact).some(module => hidden.includes(module)),
    );
    return rows.length
      ? rows.map(row => (row.text ? {text: row.text} : {fact: brief(row.fact)}))
      : null;
  }

  /** The strongest findings of the engine, each kind capped, a pair told once only. */
  private async find(userId: string, today: LocalDate): Promise<InsightFact[]> {
    const facts: InsightFact[] = [];
    const told = new Set<string>();

    facts.push(...(await this.pairs(userId, today, told)));

    const after = await this.hours.hourAfter(userId, 90);
    const named = new Map<string, QuestionNumber>([
      ...after.events.map(
        one => [one.key, {...one, unit: 'count' as const}] as const,
      ),
      ...after.outcomes.map(one => [one.key, {...one}] as const),
    ]);
    for (const result of after.results
      .filter(one => one.strong)
      .slice(0, MAX_AFTER)) {
      const cause = named.get(result.event);
      const effect = named.get(result.outcome);
      if (cause && effect) {
        told.add(pairOf(cause.key, effect.key));
        facts.push({
          kind: 'after',
          cause,
          effect,
          after: result.after,
          usual: result.usual,
          difference: result.difference,
          events: result.events,
        });
      }
    }

    const {changes} = await this.changes.list(userId);
    for (const change of changes
      .filter(one => !one.extra && one.day >= shift(today, -FRESH_CHANGE_DAYS))
      .slice(0, MAX_CHANGES)) {
      facts.push({
        kind: 'change',
        number: {
          key: change.key,
          module: change.module,
          labelKey: change.labelKey,
          ...(change.label ? {label: change.label} : {}),
          unit: change.unit,
        },
        day: change.day,
        before: change.before,
        after: change.after,
      });
    }

    const {cards} = await this.questions.list(userId);
    let questions = 0;
    for (const card of cards
      .filter(one => one.answer.strong && one.cause && one.effect)
      // The user's own questions first.
      .sort(
        (a, b) => Number(a.question.builtIn) - Number(b.question.builtIn),
      )) {
      const cause = card.cause as QuestionNumber;
      const effect = card.effect as QuestionNumber;
      if (told.has(pairOf(cause.key, effect.key))) {
        continue;
      }
      told.add(pairOf(cause.key, effect.key));
      facts.push({
        kind: 'question',
        title: card.question.title,
        cause,
        effect,
        when: card.question.when,
        answer: card.answer,
      });
      if (++questions >= MAX_QUESTIONS) {
        break;
      }
    }
    return facts;
  }

  /** The strongest links of the days, each answered as a card would be, the outcome the effect. */
  private async pairs(
    userId: string,
    today: LocalDate,
    told: Set<string>,
  ): Promise<InsightFact[]> {
    const found: InsightFact[] = [];
    const {correlations, metrics} = await this.overviews.correlations(userId, {
      from: shift(today, -PAIR_DAYS),
      to: shift(today, -1),
      pairs: 'outcomes',
    });
    const byKey = new Map<string, CorrelationMetric>(
      metrics.map(one => [one.key, one]),
    );
    for (const pair of correlations
      .filter(one => one.strong && one.lag <= 1)
      .slice(0, PAIRS_LOOKED_AT)) {
      const [cause, effect] = directionOf(pair.a, pair.b, pair.lag, key =>
        Boolean(byKey.get(key)?.outcome),
      );
      if (told.has(pairOf(cause, effect))) {
        continue;
      }
      const card = await this.questions.pair(
        userId,
        cause,
        effect,
        pair.lag ? 'nextDay' : 'sameDay',
      );
      if (card.answer.strong && card.cause && card.effect) {
        told.add(pairOf(cause, effect));
        found.push({
          kind: 'pair',
          cause: card.cause,
          effect: card.effect,
          when: card.question.when as 'sameDay' | 'nextDay',
          answer: card.answer,
        });
        if (found.length >= MAX_PAIRS) {
          break;
        }
      }
    }

    return found;
  }

  /**
   * The AI's sentence for each finding, in the user's language; the findings of the sections
   * hidden from it are not sent. No AI or no answer — none: the page words them itself.
   */
  private async word(
    userId: string,
    locale: string,
    facts: InsightFact[],
  ): Promise<(string | null)[]> {
    const none = facts.map(() => null);
    if (!facts.length || !(await this.ai.isConfigured(userId))) {
      return none;
    }
    const hidden = await this.ai.hiddenFromShared(userId);
    const sent = facts
      .map((fact, index) => ({index, fact}))
      .filter(
        ({fact}) => !modulesOf(fact).some(module => hidden.includes(module)),
      );
    if (!sent.length) {
      return none;
    }
    try {
      const reply = await this.ai.complete(
        userId,
        WORDING_INSTRUCTION.replace(
          'LANGUAGE',
          locale === 'ru' ? 'Russian' : 'English',
        ),
        JSON.stringify(sent.map(({fact}) => brief(fact))),
        'life',
      );
      const sentences = JSON.parse(reply.match(/\[[\s\S]*\]/)?.[0] ?? '[]');
      if (!Array.isArray(sentences) || sentences.length !== sent.length) {
        return none;
      }
      const texts: (string | null)[] = [...none];
      sent.forEach(({index}, position) => {
        const text = sentences[position];
        texts[index] =
          typeof text === 'string' && text.trim()
            ? text.trim().slice(0, 400)
            : null;
      });
      return texts;
    } catch {
      return none;
    }
  }

  private async hasWeek(userId: string, week: LocalDate): Promise<boolean> {
    const [row] = await this.db
      .select({id: linksInsights.id})
      .from(linksInsights)
      .where(
        and(eq(linksInsights.userId, userId), eq(linksInsights.week, week)),
      )
      .limit(1);
    return Boolean(row);
  }

  /** The rows of the latest week, in their order. */
  private async latest(userId: string): Promise<Row[]> {
    const [last] = await this.db
      .select({week: linksInsights.week})
      .from(linksInsights)
      .where(eq(linksInsights.userId, userId))
      .orderBy(desc(linksInsights.week))
      .limit(1);
    if (!last) {
      return [];
    }
    return this.db
      .select()
      .from(linksInsights)
      .where(
        and(
          eq(linksInsights.userId, userId),
          eq(linksInsights.week, last.week),
        ),
      )
      .orderBy(asc(linksInsights.position));
  }

  private async todayOf(userId: string, now: Date): Promise<LocalDate> {
    return zonedDateTime(now, await this.timeZoneOf(userId)).date;
  }

  private async timeZoneOf(userId: string): Promise<string> {
    return this.users.timeZoneOf(await this.users.findById(userId));
  }
}

/**
 * Which of a pair is the cause: the next day's number is the effect; on the same day the night
 * (sleep, the bedtime) comes before the day, and what is done before what a day gives.
 */
export function directionOf(
  a: string,
  b: string,
  lag: number,
  isOutcome: (key: string) => boolean,
): [string, string] {
  if (lag) {
    return [a, b];
  }
  const night = (key: string) => NIGHT.some(prefix => key.startsWith(prefix));
  if (night(a) !== night(b)) {
    return night(a) ? [a, b] : [b, a];
  }
  return isOutcome(a) && !isOutcome(b) ? [b, a] : [a, b];
}

/** A pair of numbers either way round: told once only. */
function pairOf(a: string, b: string): string {
  return [a, b].sort().join('|');
}

/** The Monday of a day's week. */
export function mondayOf(day: LocalDate): LocalDate {
  const weekday = (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;
  return shift(day, -weekday);
}

/** What a finding is about, the same each time it is found again in the week. */
export function keyOf(fact: InsightFact, week: LocalDate): string {
  const about =
    fact.kind === 'change'
      ? `${fact.number.key}|${fact.day}`
      : fact.kind === 'after'
        ? `${fact.cause.key}|${fact.effect.key}`
        : `${fact.cause.key}|${fact.effect.key}|${fact.when}`;
  return `${week}|${fact.kind}|${about}`;
}

function modulesOf(fact: InsightFact): string[] {
  return fact.kind === 'change'
    ? [fact.number.module]
    : [fact.cause.module, fact.effect.module];
}

/** A key as the AI gets it: one carrying the user's own words (a diary tag) unnamed. */
function forAi(key: string): string {
  const prefix = UNNAMED_FOR_AI.find(one => key.startsWith(one));
  return prefix ? `${prefix.slice(0, -1)}` : key;
}

/** A finding as the AI gets it: keys and numbers only. */
function brief(fact: InsightFact): Record<string, unknown> {
  switch (fact.kind) {
    case 'change':
      return {
        kind: fact.kind,
        number: forAi(fact.number.key),
        unit: fact.number.unit,
        day: fact.day,
        before: fact.before,
        after: fact.after,
      };
    case 'after':
      return {
        kind: fact.kind,
        event: forAi(fact.cause.key),
        number: forAi(fact.effect.key),
        unit: fact.effect.unit,
        after: fact.after,
        usual: fact.usual,
        times: fact.events,
      };
    default:
      return {
        kind: fact.kind,
        cause: forAi(fact.cause.key),
        effect: forAi(fact.effect.key),
        effectUnit: fact.effect.unit,
        when: fact.when,
        threshold: fact.answer.threshold,
        more: fact.answer.high,
        less: fact.answer.low,
        days: fact.answer.n,
        holds: Object.fromEntries(
          fact.answer.confounders.map(one => [one.confounder, one.holds]),
        ),
      };
  }
}

function toInsight(row: Row): LinksInsight {
  return {
    id: row.id,
    key: row.key,
    week: row.week,
    fact: row.fact,
    text: row.text,
  };
}
