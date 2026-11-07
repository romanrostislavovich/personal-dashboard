import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  DailyMetric,
  HourEvent,
  HourlyMetric,
  LinksQuestion,
  LinksQuestionCard,
  LinksQuestions,
  LocalDate,
  QUESTION_WHEN,
  QuestionAnswer,
  QuestionInput,
  QuestionNumber,
  QuestionWhen,
  zonedDateTime,
} from '@pd/contracts';
import {and, asc, eq} from 'drizzle-orm';
import {AiService} from '../../ai/ai.service';
import {DB, Database} from '../../database/database.module';
import {UsersService} from '../../users/users.service';
import {daysOf, seriesOf, shift} from '../daily-series';
import {hourAfter} from '../hours/hour-after';
import {HoursService} from '../hours/hours.service';
import {LinksService} from '../links.service';
import {linksQuestions} from '../links.schema';
import {answerDays, Strata} from './answer';

/** The questions read a year of days and 90 days of hours. */
const HISTORY_DAYS = 365;
const HOURS_DAYS = 90;
/** The days of a cause and its effect are reused this long. */
const FRESH_MS = 3_600_000;
/** An illness: a diagnosis that ended within this long (a lifelong one tells no day apart). */
const ILLNESS_MAX_DAYS = 30;
/** A day at home less than this many hours is a day away (a trip). */
const AWAY_HOURS = 2;
/** The built-in question of the night phone asks about this many habits at most. */
const HABITS = 5;
const OWN_QUESTIONS = 30;

/** The owner's hypotheses (docs/proposals/links-v2.md, section 3), ready as cards. */
const BUILT_IN: Omit<LinksQuestion, 'builtIn' | 'title' | 'condition'>[] = [
  {
    id: 'builtin.interruptions.deepWork',
    cause: 'activity.index.focusInterruptions',
    effect: 'activity.index.deepWork',
    when: 'sameDay',
  },
  {
    id: 'builtin.interruptions.coding',
    cause: 'activity.index.focusInterruptions',
    effect: 'development.coding',
    when: 'sameDay',
  },
  {
    id: 'builtin.home.tasks',
    cause: 'activity.places.home',
    effect: 'tasks.done',
    when: 'sameDay',
  },
  {
    id: 'builtin.home.mood',
    cause: 'activity.places.home',
    effect: 'diary.mood',
    when: 'sameDay',
  },
  {
    id: 'builtin.music.deepWork',
    cause: 'music.event.listening',
    effect: 'activity.hour.deepWork',
    when: 'hourAfter',
  },
];
/** "Phone after midnight → a habit missed the next day", one card for each habit. */
const NIGHT_PHONE = 'activity.phone.night';

interface Known {
  days: DailyMetric[];
  hourly: HourlyMetric[];
  events: HourEvent[];
  illness: Set<LocalDate>;
}

const DRAFT_INSTRUCTION =
  'You turn a question someone asks about their own life into a card a statistics engine can ' +
  'answer: does a cause go with an effect. Pick the cause and the effect only from the catalog ' +
  'by `key`: `numbers` are daily (then `when` is "sameDay" or "nextDay"); for the hour after an ' +
  'event the cause is one of `events` and the effect one of `hourly`, with `when` "hourAfter". ' +
  'An optional `condition` ({key, high}) is a daily number the link may matter only when it is ' +
  'high (true) or low (false). Answer with JSON only: {"cause", "effect", "when", "condition"?}, ' +
  'or {"error": "…"} in the language of the question when nothing in the catalog fits.';

/**
 * Questions of Links v2: the owner's hypotheses as built-in cards and their own ones ("does A
 * go with B?", picked from the numbers or put in words for the AI to turn into a card), each
 * answered anew from the days there are, with whether it holds within weekends, rain, illness
 * and travel.
 */
@Injectable()
export class QuestionsService {
  private readonly fresh = new Map<
    string,
    {at: number; value: Promise<Known>}
  >();

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly links: LinksService,
    private readonly hours: HoursService,
    private readonly users: UsersService,
    private readonly ai: AiService,
  ) {}

  /** Every card answered, and what a new one may be made of; `hidden` sections left out. */
  async list(userId: string, hidden: string[] = []): Promise<LinksQuestions> {
    const known = await this.known(userId);
    const visible = <T extends {module: string}>(list: T[]) =>
      list.filter(one => !hidden.includes(one.module));
    const days = visible(known.days).filter(one => !one.extra);
    const hourly = visible(known.hourly);
    const events = visible(known.events);
    const questions = [...this.builtIns(days), ...(await this.own(userId))];
    const visibleKnown = {...known, days, hourly, events};
    const span = this.daysKnown(days);
    return {
      cards: questions.map(question =>
        this.answer(question, visibleKnown, span),
      ),
      numbers: days.map(numberOf),
      events: events.map(event => numberOf({...event, unit: 'count'})),
      hourly: hourly.map(numberOf),
    };
  }

  /** Any pair of daily numbers answered as a card would be (for the week's findings). */
  async pair(
    userId: string,
    cause: string,
    effect: string,
    when: 'sameDay' | 'nextDay',
  ): Promise<LinksQuestionCard> {
    const known = await this.known(userId);
    const days = known.days.filter(one => !one.extra);
    return this.answer(
      {
        id: `pair.${cause}.${effect}`,
        builtIn: false,
        title: null,
        cause,
        effect,
        when,
        condition: null,
      },
      {...known, days},
      this.daysKnown(days),
    );
  }

  /** Keeps an own question: its numbers must be ones the user has. */
  async add(userId: string, input: QuestionInput): Promise<LinksQuestion> {
    const {numbers, events, hourly} = await this.list(userId);
    const has = (list: QuestionNumber[], key: string) =>
      list.some(one => one.key === key);
    const fits =
      input.when === 'hourAfter'
        ? has(events, input.cause) && has(hourly, input.effect)
        : has(numbers, input.cause) &&
          has(numbers, input.effect) &&
          (!input.condition || has(numbers, input.condition.key));
    if (!fits || input.cause === input.effect) {
      throw new BadRequestException('Unknown numbers for a question');
    }
    if ((await this.own(userId)).length >= OWN_QUESTIONS) {
      throw new BadRequestException('Too many questions');
    }
    const [row] = await this.db
      .insert(linksQuestions)
      .values({
        userId,
        title: input.title?.trim() || null,
        cause: input.cause,
        effect: input.effect,
        when: input.when,
        conditionKey:
          input.when === 'hourAfter' ? null : (input.condition?.key ?? null),
        conditionHigh:
          input.when === 'hourAfter' ? null : (input.condition?.high ?? null),
      })
      .returning();
    return toQuestion(row);
  }

  async remove(userId: string, id: string): Promise<void> {
    const removed = await this.db
      .delete(linksQuestions)
      .where(and(eq(linksQuestions.userId, userId), eq(linksQuestions.id, id)))
      .returning({id: linksQuestions.id});
    if (!removed.length) {
      throw new NotFoundException();
    }
  }

  /** How many questions of their own the user asked (for the achievement). */
  async ownCount(userId: string): Promise<number> {
    return this.db.$count(linksQuestions, eq(linksQuestions.userId, userId));
  }

  /**
   * A question in the owner's words turned by the AI into a card to confirm (not kept): only the
   * names of the numbers go to it, never the data, and not those of the sections hidden from it.
   */
  async draft(userId: string, text: string): Promise<QuestionInput> {
    if (!(await this.ai.isConfigured(userId))) {
      throw new BadRequestException('AI is not configured');
    }
    const {numbers, events, hourly} = await this.list(
      userId,
      await this.ai.hiddenFromShared(userId),
    );
    const catalog = {
      numbers: numbers.map(({key, unit}) => ({key, unit})),
      events: events.map(({key}) => ({key})),
      hourly: hourly.map(({key, unit}) => ({key, unit})),
    };
    const reply = await this.ai.complete(
      userId,
      DRAFT_INSTRUCTION,
      `Catalog: ${JSON.stringify(catalog)}\n\nQuestion: ${text}`,
      'life',
    );
    const draft = parseDraft(reply, catalog);
    if ('error' in draft) {
      throw new UnprocessableEntityException(draft.error);
    }
    return {...draft, title: text.slice(0, 200)};
  }

  /** The built-in cards, the night phone's one for each of the habits (a few). */
  private builtIns(days: DailyMetric[]): LinksQuestion[] {
    const habits = days
      .filter(metric => metric.module === 'habits' && !metric.partOf)
      .slice(0, HABITS);
    return [
      ...BUILT_IN,
      ...habits.map(habit => ({
        id: `builtin.nightPhone.${habit.key}`,
        cause: NIGHT_PHONE,
        effect: habit.key,
        when: 'nextDay' as const,
      })),
    ].map(question => ({
      ...question,
      builtIn: true,
      title: null,
      condition: null,
    }));
  }

  private async own(userId: string): Promise<LinksQuestion[]> {
    const rows = await this.db
      .select()
      .from(linksQuestions)
      .where(eq(linksQuestions.userId, userId))
      .orderBy(asc(linksQuestions.createdAt));
    return rows.map(toQuestion);
  }

  private answer(
    question: LinksQuestion,
    known: Known,
    days: LocalDate[],
  ): LinksQuestionCard {
    const daily = (key: string) => known.days.find(one => one.key === key);
    if (question.when === 'hourAfter') {
      const event = known.events.find(one => one.key === question.cause);
      const metric = known.hourly.find(one => one.key === question.effect);
      return {
        question,
        cause: event ? numberOf({...event, unit: 'count'}) : null,
        effect: metric ? numberOf(metric) : null,
        condition: null,
        answer: event && metric ? afterAnswer(metric, event) : missing(),
      };
    }
    const cause = daily(question.cause);
    const effect = daily(question.effect);
    const condition = question.condition
      ? daily(question.condition.key)
      : undefined;
    if (!cause || !effect || (question.condition && !condition)) {
      return {
        question,
        cause: cause ? numberOf(cause) : null,
        effect: effect ? numberOf(effect) : null,
        condition: condition ? numberOf(condition) : null,
        answer: missing(),
      };
    }
    const seriesOfKey = (key: string) => {
      const metric = daily(key);
      return metric ? seriesOf(metric, days) : new Map<LocalDate, number>();
    };
    const rain = seriesOfKey('weather.rain');
    const home = seriesOfKey('activity.places.home');
    const strata: Strata = {
      weekend: day => [0, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay()),
      rain: day => (rain.has(day) ? (rain.get(day) as number) > 0 : undefined),
      illness: day => known.illness.has(day),
      travel: day =>
        home.has(day) ? (home.get(day) as number) < AWAY_HOURS : undefined,
    };
    return {
      question,
      cause: numberOf(cause),
      effect: numberOf(effect),
      condition: condition ? numberOf(condition) : null,
      answer: answerDays(
        seriesOf(cause, days),
        seriesOf(effect, days),
        question.when === 'nextDay' ? 1 : 0,
        strata,
        condition ? seriesOf(condition, days) : undefined,
      ),
    };
  }

  /** The days of the year read: from the first day any number has, to yesterday. */
  private daysKnown(metrics: DailyMetric[]): LocalDate[] {
    const all = metrics.flatMap(metric => metric.days.map(one => one.day));
    if (!all.length) {
      return [];
    }
    const from = all.reduce((a, b) => (a < b ? a : b));
    const to = all.reduce((a, b) => (a > b ? a : b));
    return daysOf({from, to});
  }

  /** What the questions read, kept an hour: a year of every number is a lot to read. */
  private known(userId: string): Promise<Known> {
    const now = Date.now();
    for (const [key, one] of this.fresh) {
      if (now - one.at >= FRESH_MS) {
        this.fresh.delete(key);
      }
    }
    const kept = this.fresh.get(userId);
    if (kept) {
      return kept.value;
    }
    const value = this.read(userId);
    this.fresh.set(userId, {at: now, value});
    // A failed reading is not kept: the next one asks again.
    value.catch(() => this.fresh.delete(userId));
    return value;
  }

  private async read(userId: string): Promise<Known> {
    const timeZone = this.users.timeZoneOf(await this.users.findById(userId));
    const today = zonedDateTime(new Date(), timeZone).date;
    const period = {from: shift(today, -HISTORY_DAYS), to: shift(today, -1)};
    const [days, hours, periods] = await Promise.all([
      this.links.dailyMetrics(userId, period),
      this.hours.hours(userId, HOURS_DAYS),
      this.links.periodsBetween(userId, period),
    ]);
    const illness = new Set<LocalDate>();
    for (const one of periods) {
      if (one.kind !== 'diagnosis' || !one.to) {
        continue;
      }
      const span = daysOf({from: one.from, to: one.to});
      if (span.length <= ILLNESS_MAX_DAYS) {
        span.forEach(day => illness.add(day));
      }
    }
    return {
      days,
      hourly: hours.metrics,
      events: hours.events,
      illness,
    };
  }
}

function numberOf(
  metric: Pick<DailyMetric, 'key' | 'module' | 'labelKey' | 'label'> & {
    unit: QuestionNumber['unit'];
  },
): QuestionNumber {
  return {
    key: metric.key,
    module: metric.module,
    labelKey: metric.labelKey,
    ...(metric.label ? {label: metric.label} : {}),
    unit: metric.unit,
  };
}

function missing(): QuestionAnswer {
  return {
    status: 'missing',
    n: 0,
    threshold: null,
    high: null,
    low: null,
    difference: null,
    p: null,
    strong: false,
    confounders: [],
    condition: null,
  };
}

/** The hour after an event as an answer: `high` is after it, `low` the usual hours. */
function afterAnswer(metric: HourlyMetric, event: HourEvent): QuestionAnswer {
  const [result] = hourAfter([metric], [event]);
  if (!result) {
    return {...missing(), status: 'few', n: event.hours.length};
  }
  return {
    ...missing(),
    status: 'answered',
    n: result.events,
    high: result.after,
    low: result.usual,
    difference: result.difference,
    p: result.q,
    strong: result.strong,
  };
}

function toQuestion(row: typeof linksQuestions.$inferSelect): LinksQuestion {
  return {
    id: row.id,
    builtIn: false,
    title: row.title,
    cause: row.cause,
    effect: row.effect,
    when: row.when,
    condition:
      row.conditionKey !== null && row.conditionHigh !== null
        ? {key: row.conditionKey, high: row.conditionHigh}
        : null,
  };
}

/** The AI's card checked against the catalog. */
export function parseDraft(
  reply: string,
  catalog: {
    numbers: {key: string}[];
    events: {key: string}[];
    hourly: {key: string}[];
  },
): Omit<QuestionInput, 'title'> | {error: string} {
  const json = reply.match(/\{[\s\S]*\}/)?.[0];
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(json ?? '');
  } catch {
    return {error: reply.trim().slice(0, 300) || 'The AI gave no card'};
  }
  if (typeof data['error'] === 'string') {
    return {error: data['error'].slice(0, 300)};
  }
  const when = data['when'] as QuestionWhen;
  const has = (list: {key: string}[], key: unknown) =>
    typeof key === 'string' && list.some(one => one.key === key);
  if (!(QUESTION_WHEN as readonly string[]).includes(when)) {
    return {error: 'The AI gave no time for the effect'};
  }
  const fits =
    when === 'hourAfter'
      ? has(catalog.events, data['cause']) &&
        has(catalog.hourly, data['effect'])
      : has(catalog.numbers, data['cause']) &&
        has(catalog.numbers, data['effect']);
  if (!fits) {
    return {error: 'The AI picked numbers that are not there'};
  }
  const condition = data['condition'] as {key?: unknown; high?: unknown};
  return {
    cause: data['cause'] as string,
    effect: data['effect'] as string,
    when,
    ...(when !== 'hourAfter' &&
    condition &&
    has(catalog.numbers, condition.key) &&
    typeof condition.high === 'boolean'
      ? {condition: {key: condition.key as string, high: condition.high}}
      : {}),
  };
}
