import {Inject, Injectable, OnModuleInit} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {
  InsightFact,
  LinksInsight,
  LinksInsights,
  LocalDate,
  QuestionNumber,
  zonedDateTime,
} from '@pd/contracts';
import {and, asc, desc, eq} from 'drizzle-orm';
import {AiService} from '../../ai/ai.service';
import {AppConfig} from '../../config/env';
import {MorningDigestService} from '../../ai/morning-digest.service';
import {DB, Database} from '../../database/database.module';
import {forEachUser} from '../../scheduler/for-each-user';
import {SchedulerService} from '../../scheduler/scheduler.service';
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
/** Asked to look again sooner than this, the week's findings stay as they are (the AI costs). */
const REFRESH_MS = 3_600_000;
const DAY_MS = 86_400_000;

const WORDING_INSTRUCTION =
  "You word a person's findings about their own life, found by a statistics engine from their " +
  'own numbers. For each finding write one calm sentence in LANGUAGE, as a person would say it: ' +
  'name the numbers in plain words (they come as keys: activity.phone.night is the phone at ' +
  'night, tasks.done — tasks done, diary.mood — the mood 1–5), tell the difference with its ' +
  'numbers and on how many days or times it was seen; "goes with", never "causes" or advice. ' +
  'If `holds` says a link does not hold within weekends, rain, illness or travel, say it may be ' +
  'that. `pair`: on the days the cause is above `threshold` the effect (the same or the next ' +
  'day) averages `more` against `less`. `after`: in the hour after the event the number averages ' +
  '`after` against `usual` in the same hours without it. `change`: the number moved from `before` ' +
  'to `after` since `day`. `question`: the answer to their own question, like a pair. Answer ' +
  'with a JSON array of the sentences only, in the same order.';

type Row = typeof linksInsights.$inferSelect;

/**
 * The week's findings (Links v2's insight cards): every Monday the strongest of what the engine
 * found — links of the days, the hour after an event, fresh changes, answered questions — each
 * checked against weekends, rain, illness and travel, worded by the AI from the aggregates only
 * (never texts or places), and kept for the week; Home shows one a day, the Monday digest tells
 * the new ones.
 */
@Injectable()
export class InsightsService implements OnModuleInit {
  /** A sync client makes none: the server's arrive with the sync (two weeks would clash). */
  private readonly isSyncClient: boolean;

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
  ) {
    this.isSyncClient = config.get('SYNC_MODE', {infer: true}) === 'client';
  }

  onModuleInit(): void {
    // Monday morning, before the digest: the week's findings are in it.
    this.scheduler.register({
      name: 'links.insights',
      cron: '30 5 * * 1',
      handler: async () =>
        forEachUser('links.insights', await this.users.findAll(), user =>
          this.make(user.id),
        ),
    });
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

  /** The latest week's findings, and the one of today. */
  async list(userId: string, now = new Date()): Promise<LinksInsights> {
    const rows = await this.latest(userId);
    const day = Math.floor(now.getTime() / DAY_MS);
    return {
      week: rows[0]?.week ?? null,
      insights: rows.map(toInsight),
      today: rows.length ? day % rows.length : 0,
    };
  }

  /** Looks for this week's findings now (the page's button), at most once an hour. */
  async refresh(userId: string, now = new Date()): Promise<LinksInsights> {
    const [last] = await this.latest(userId);
    if (
      !this.isSyncClient &&
      (!last || now.getTime() - last.createdAt.getTime() >= REFRESH_MS)
    ) {
      await this.make(userId, now);
    }
    return this.list(userId, now);
  }

  /** Whether a finding is the user's own (an opened one counts for the achievements). */
  async owns(userId: string, id: string): Promise<boolean> {
    const [row] = await this.db
      .select({id: linksInsights.id})
      .from(linksInsights)
      .where(and(eq(linksInsights.userId, userId), eq(linksInsights.id, id)));
    return Boolean(row);
  }

  /** Finds, words and keeps the week's findings, in place of the week's earlier ones. */
  async make(userId: string, now = new Date()): Promise<void> {
    const user = await this.users.findById(userId);
    const today = zonedDateTime(now, this.users.timeZoneOf(user)).date;
    const week = mondayOf(today);
    const facts = (await this.find(userId, today)).slice(0, MAX_INSIGHTS);
    const texts = await this.word(userId, user?.locale ?? 'en', facts);
    await this.db.transaction(async tx => {
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
            position,
            fact,
            text: texts[position] ?? null,
          })),
        );
      }
    });
  }

  /** The week's news for the Monday digest; the sections hidden from the AI stay out. */
  async digestFacts(userId: string, now = new Date()): Promise<unknown> {
    const user = await this.users.findById(userId);
    const today = zonedDateTime(now, this.users.timeZoneOf(user)).date;
    if (new Date(`${today}T12:00:00Z`).getUTCDay() !== 1) {
      return null;
    }
    const hidden = await this.ai.hiddenFromShared(userId);
    const rows = (await this.latest(userId)).filter(
      row =>
        row.week === mondayOf(today) &&
        !modulesOf(row.fact).some(module => hidden.includes(module)),
    );
    return rows.length
      ? rows.map(row => (row.text ? {text: row.text} : {fact: brief(row.fact)}))
      : null;
  }

  /** The strongest findings of the engine, each kind capped, the surest first. */
  private async find(userId: string, today: LocalDate): Promise<InsightFact[]> {
    const yesterday = shift(today, -1);
    const facts: InsightFact[] = [];

    const {correlations} = await this.overviews.correlations(userId, {
      from: shift(today, -PAIR_DAYS),
      to: yesterday,
      pairs: 'outcomes',
    });
    const pairs: InsightFact[] = [];
    for (const pair of correlations
      .filter(one => one.strong && one.lag <= 1)
      .slice(0, PAIRS_LOOKED_AT)) {
      const card = await this.questions.pair(
        userId,
        pair.a,
        pair.b,
        pair.lag ? 'nextDay' : 'sameDay',
      );
      if (card.answer.strong && card.cause && card.effect) {
        pairs.push({
          kind: 'pair',
          cause: card.cause,
          effect: card.effect,
          when: card.question.when as 'sameDay' | 'nextDay',
          answer: card.answer,
        });
      }
      if (pairs.length >= MAX_PAIRS) {
        break;
      }
    }
    facts.push(...pairs);

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
    for (const card of cards
      .filter(one => one.answer.strong && one.cause && one.effect)
      // The user's own questions first.
      .sort((a, b) => Number(a.question.builtIn) - Number(b.question.builtIn))
      .slice(0, MAX_QUESTIONS)) {
      facts.push({
        kind: 'question',
        title: card.question.title,
        cause: card.cause as QuestionNumber,
        effect: card.effect as QuestionNumber,
        when: card.question.when,
        answer: card.answer,
      });
    }
    return facts;
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
}

/** The Monday of a day's week. */
export function mondayOf(day: LocalDate): LocalDate {
  const weekday = (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;
  return shift(day, -weekday);
}

function modulesOf(fact: InsightFact): string[] {
  return fact.kind === 'change'
    ? [fact.number.module]
    : [fact.cause.module, fact.effect.module];
}

/** A finding as the AI gets it: keys and numbers only. */
function brief(fact: InsightFact): Record<string, unknown> {
  switch (fact.kind) {
    case 'change':
      return {
        kind: fact.kind,
        number: fact.number.key,
        unit: fact.number.unit,
        day: fact.day,
        before: fact.before,
        after: fact.after,
      };
    case 'after':
      return {
        kind: fact.kind,
        event: fact.cause.key,
        number: fact.effect.key,
        unit: fact.effect.unit,
        after: fact.after,
        usual: fact.usual,
        times: fact.events,
      };
    default:
      return {
        kind: fact.kind,
        cause: fact.cause.key,
        effect: fact.effect.key,
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
  return {id: row.id, week: row.week, fact: row.fact, text: row.text};
}
