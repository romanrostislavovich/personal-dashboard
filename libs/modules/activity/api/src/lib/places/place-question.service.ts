import {Inject, Injectable, Logger, OnModuleInit} from '@nestjs/common';
import {
  BotActionReply,
  DB,
  Database,
  NotificationAction,
  NotificationsService,
  TelegramBotService,
  UserRow,
  UsersService,
} from '@pd/api-core';
import {zonedDateTime} from '@pd/contracts';
import {and, eq, gte, isNull} from 'drizzle-orm';
import {namedAt} from './frequent';
import {FoundPlace} from './place-lookup.clients';
import {PlaceNamesService} from './place-names.service';
import {placesMessages} from './places.messages';
import {activityPlaceQuestions} from './places.schema';
import {PlacesService} from './places.service';
import {entriesOf, Point, Stay} from './stays';

/** The Telegram buttons: `plc:<question id>:<0–2>` a place offered, `plc:<id>:n` — another one. */
export const PLACE_ACTION = 'plc';
/** The fixes looked at: the stays of the last few hours. */
const LOOK_BACK_MS = 6 * 3_600_000;
/** A stay is asked about once it is over by this much: the phone has really left. */
const LEFT_MS = 5 * 60_000;
/** Shorter stays are not worth a question (a shop on the way). */
const MIN_STAY_MS = 15 * 60_000;
/** An older stay is not asked about any more: the answer would not be remembered well. */
const FRESH_MS = 3 * 3_600_000;
/** Places offered as buttons. */
const CHOICES = 3;
/** Two stays starting this close are one, asked once (the start moves a little with new fixes). */
const SAME_STAY_MS = 20 * 60_000;

/**
 * "Where were you?" (the owner's choice, 2026-10-30): a stay of a quarter of an hour or more at a
 * place with neither a name of the user's nor one the user gave before is asked about once it is
 * over — the places Google knows nearby as buttons (with the user's key; else OpenStreetMap's
 * name), and "Another place" to type its name. The answer names the place from then on.
 */
@Injectable()
export class PlaceQuestionService implements OnModuleInit {
  private readonly logger = new Logger(PlaceQuestionService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly places: PlacesService,
    private readonly names: PlaceNamesService,
    private readonly notifications: NotificationsService,
    private readonly users: UsersService,
    private readonly telegram: TelegramBotService,
  ) {}

  onModuleInit(): void {
    this.telegram.registerAction({
      name: PLACE_ACTION,
      handler: (user, payload) => this.answer(user, payload),
    });
  }

  /** After new fixes: the last stay that is over, asked about if it has no name. */
  async askAfterFixes(userId: string, now = Date.now()): Promise<void> {
    if (!this.names.looksUp) {
      return;
    }
    try {
      const [fixes, named, known] = await Promise.all([
        this.places.fixesBetween(userId, now - LOOK_BACK_MS, now + 60_000),
        this.places.named(userId),
        this.names.known(userId),
      ]);
      const last = Math.max(0, ...fixes.map(fix => fix.at));
      const stay = entriesOf(fixes)
        .filter(
          (entry): entry is {kind: 'stay'} & Stay =>
            entry.kind === 'stay' &&
            entry.end - entry.start >= MIN_STAY_MS &&
            last - entry.end >= LEFT_MS &&
            now - entry.end <= FRESH_MS,
        )
        .pop();
      const found = stay ? this.names.nameAt(stay, known) : null;
      if (!stay || namedAt(stay, named) || found?.source === 'user') {
        return;
      }
      if (await this.askedAbout(userId, stay)) {
        return;
      }
      await this.ask(
        userId,
        stay,
        await this.names.choices(userId, stay, known),
      );
    } catch (error) {
      this.logger.warn(
        `"Where were you?" was not asked: ${String(error).slice(0, 200)}`,
      );
    }
  }

  /** A button under the question, or the name typed after "Another place". */
  async answer(user: UserRow, payload: string): Promise<BotActionReply> {
    const text = placesMessages(user.locale);
    const [id, choice] = payload.split(':');
    const [question] = await this.db
      .select()
      .from(activityPlaceQuestions)
      .where(
        and(
          eq(activityPlaceQuestions.id, id ?? ''),
          eq(activityPlaceQuestions.userId, user.id),
        ),
      );
    if (!question) {
      return text.gone;
    }
    const point = pointOf(question.point);
    const offered = JSON.parse(question.offered) as FoundPlace[];
    const save = async (place: FoundPlace) => {
      await this.names.answer(user.id, point, place);
      await this.db
        .update(activityPlaceQuestions)
        .set({answeredAt: new Date()})
        .where(eq(activityPlaceQuestions.id, question.id));
      return text.saved(place.name);
    };
    const picked = offered[Number(choice)];
    if (choice !== 'n' && picked) {
      return save(picked);
    }
    return {
      reply: text.typeName,
      expectText: async (_author, words) => {
        const name = words.trim().slice(0, 200);
        return name ? save({name, kind: null}) : text.notSaved;
      },
    };
  }

  /** A question about a stay starting near this one, already asked. */
  private async askedAbout(userId: string, stay: Stay): Promise<boolean> {
    const rows = await this.db
      .select({stayStart: activityPlaceQuestions.stayStart})
      .from(activityPlaceQuestions)
      .where(
        and(
          eq(activityPlaceQuestions.userId, userId),
          gte(
            activityPlaceQuestions.stayStart,
            new Date(stay.start - SAME_STAY_MS),
          ),
        ),
      );
    return rows.some(
      row => Math.abs(row.stayStart.getTime() - stay.start) <= SAME_STAY_MS,
    );
  }

  private async ask(
    userId: string,
    stay: Stay,
    choices: FoundPlace[],
  ): Promise<void> {
    const offered = choices.slice(0, CHOICES);
    const [question] = await this.db
      .insert(activityPlaceQuestions)
      .values({
        userId,
        point: `${stay.latitude.toFixed(6)},${stay.longitude.toFixed(6)}`,
        stayStart: new Date(stay.start),
        stayEnd: new Date(stay.end),
        offered: JSON.stringify(offered),
      })
      .returning({id: activityPlaceQuestions.id});
    const user = await this.users.findById(userId);
    const zone = this.users.timeZoneOf(user);
    const text = placesMessages(user?.locale);
    const time = (ms: number) => zonedDateTime(new Date(ms), zone).time;
    const actions: NotificationAction[] = [
      ...offered.map((place, index) => ({
        label: place.name.slice(0, 40),
        action: `${PLACE_ACTION}:${question.id}:${index}`,
        newRow: true,
      })),
      {
        label: text.another,
        action: `${PLACE_ACTION}:${question.id}:n`,
        newRow: true,
      },
    ];
    await this.notifications.send(userId, {
      title: text.question,
      body: text.when(time(stay.start), time(stay.end), offered.length > 0),
      source: 'activity',
      actions,
    });
  }

  /** The questions not answered (for a test, and the page later). */
  unanswered(userId: string) {
    return this.db
      .select()
      .from(activityPlaceQuestions)
      .where(
        and(
          eq(activityPlaceQuestions.userId, userId),
          isNull(activityPlaceQuestions.answeredAt),
        ),
      );
  }
}

function pointOf(text: string): Point {
  const [latitude, longitude] = text.split(',').map(Number);
  return {latitude, longitude};
}
