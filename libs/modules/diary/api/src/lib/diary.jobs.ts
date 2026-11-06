import {Injectable, Logger, OnModuleInit} from '@nestjs/common';
import {
  forEachUser,
  NotificationsService,
  SchedulerService,
  TelegramBotService,
  UsersService,
} from '@pd/api-core';
import {diaryMessages} from './diary.messages';
import {DiarySummaryService} from './diary-summary.service';
import {DiaryPhotosService} from './diary-photos.service';
import {DiaryService} from './diary.service';

const MOOD_EMOJI = ['', '😞', '😕', '😐', '🙂', '😄'];
/** Telegram rejects messages longer than 4096 characters. */
const TELEGRAM_MAX_LENGTH = 4000;

/**
 * Connects the diary to the outside world:
 * - bot commands: `/d text` appends a note to today's entry, `/mood 4` rates the day,
 *   `/today` shows today's entry; a photo sent to the bot is added to today's entry;
 * - at 21:00, an evening check-in for those who enabled it and have not written today: the
 *   bot asks how the day was, a button sets the mood, then the energy and the anxiety (1–5),
 *   and the next message goes to the entry;
 * - on Sundays at 20:00, an AI summary of the week (for those who enabled it).
 */
/** The button under the Sunday review: the answers go to the diary. */
const WEEKLY_ACTION = 'dwr';

@Injectable()
export class DiaryJobs implements OnModuleInit {
  private readonly logger = new Logger(DiaryJobs.name);

  constructor(
    private readonly scheduler: SchedulerService,
    private readonly telegram: TelegramBotService,
    private readonly users: UsersService,
    private readonly diary: DiaryService,
    private readonly notifications: NotificationsService,
    private readonly summaries: DiarySummaryService,
    private readonly photos: DiaryPhotosService,
  ) {}

  onModuleInit(): void {
    this.telegram.registerCommand({
      command: 'd',
      description: {
        en: diaryMessages('en').commandDescription,
        ru: diaryMessages('ru').commandDescription,
      },
      handler: async (user, note) => {
        const replies = diaryMessages(user.locale);
        if (!note) {
          return replies.usage;
        }
        await this.diary.appendToToday(user.id, note);
        return replies.saved;
      },
    });

    this.telegram.registerCommand({
      command: 'mood',
      description: {
        en: diaryMessages('en').moodDescription,
        ru: diaryMessages('ru').moodDescription,
      },
      handler: async (user, args) => {
        const replies = diaryMessages(user.locale);
        const mood = Number(args);
        if (!Number.isInteger(mood) || mood < 1 || mood > 5) {
          return replies.moodUsage;
        }
        await this.diary.setTodayMood(user.id, mood);
        return replies.moodSaved(MOOD_EMOJI[mood]);
      },
    });

    this.telegram.registerCommand({
      command: 'today',
      description: {
        en: diaryMessages('en').todayDescription,
        ru: diaryMessages('ru').todayDescription,
      },
      handler: async user => {
        const entry = await this.diary.todayEntry(user.id);
        if (!entry?.content.trim() && !entry?.mood) {
          return diaryMessages(user.locale).todayEmpty;
        }
        const text = [
          entry.mood ? MOOD_EMOJI[entry.mood] : '',
          entry.content.trim(),
        ]
          .filter(Boolean)
          .join('\n\n');
        return text.length > TELEGRAM_MAX_LENGTH
          ? `${text.slice(0, TELEGRAM_MAX_LENGTH)}…`
          : text;
      },
    });

    this.telegram.registerPhotoHandler(
      async (user, photo) => {
        const day = this.diary.todayDate();
        await this.photos.add(user.id, day, {
          data: await photo.download(),
          mimeType: photo.mimeType,
          caption: photo.caption,
        });
        if (photo.caption.trim()) {
          await this.diary.appendToToday(user.id, `📷 ${photo.caption}`);
        }
        return diaryMessages(user.locale).photoSaved;
      },
      {id: 'diary', label: {en: '📔 To the diary', ru: '📔 В дневник'}},
    );

    // The buttons under the evening question: `dmood:<day>:<1–5>`. The day is in the button, so
    // an answer after midnight still goes to the day that was asked about. The check-in goes on:
    // energy, then anxiety (`dfeel:<e|a>:<day>:<1–5>`), then a few words.
    this.telegram.registerAction({
      name: 'dmood',
      handler: async (user, payload) => {
        const [day, value] = payload.split(':');
        const mood = Number(value);
        const replies = diaryMessages(user.locale);
        if (!isDay(day) || !isScore(mood)) {
          return replies.moodUsage;
        }
        await this.diary.setMood(user.id, day, mood);
        await this.askFeeling(user.id, user.locale, 'e', day);
        return replies.moodNoted(MOOD_EMOJI[mood]);
      },
      // Held by the quiet hours till the morning, the reminder is not sent if the day got written.
      settled: (user, payload) =>
        this.diary.dayStarted(user.id, payload.split(':')[0]),
    });

    this.telegram.registerAction({
      name: 'dfeel',
      handler: async (user, payload) => {
        const [kind, day, value] = payload.split(':');
        const score = Number(value);
        const replies = diaryMessages(user.locale);
        if ((kind !== 'e' && kind !== 'a') || !isDay(day) || !isScore(score)) {
          return replies.moodUsage;
        }
        await this.diary.setFeeling(
          user.id,
          day,
          kind === 'e' ? 'energy' : 'anxiety',
          score,
        );
        if (kind === 'e') {
          await this.askFeeling(user.id, user.locale, 'a', day);
          return replies.feelingNoted;
        }
        return {
          reply: replies.checkInAskWords('📔'),
          expectText: async (author, text) => {
            await this.diary.appendNote(author.id, day, text);
            return diaryMessages(author.locale).saved;
          },
        };
      },
    });

    this.scheduler.register({
      name: 'diary.evening-reminder',
      cron: '0 21 * * *',
      handler: () => this.remind(),
    });

    this.telegram.registerAction({
      name: WEEKLY_ACTION,
      handler: async user => {
        const text = diaryMessages(user.locale);
        return {
          reply: text.weeklyAnswerAsk,
          expectText: async (author, answer) => {
            await this.diary.appendToToday(
              author.id,
              `${diaryMessages(author.locale).weeklyAnswerPrefix}\n${answer}`,
            );
            return diaryMessages(author.locale).saved;
          },
        };
      },
    });

    this.scheduler.register({
      name: 'diary.weekly-summary',
      cron: '0 20 * * 0',
      handler: () => this.sendWeeklySummaries(),
    });
  }

  async sendWeeklySummaries(): Promise<void> {
    for (const userId of await this.diary.usersWithWeeklySummary()) {
      try {
        const review = await this.summaries.weeklyReview(
          userId,
          this.diary.lastWeek(),
        );
        if (!review) {
          continue;
        }
        const user = await this.users.findById(userId);
        const text = diaryMessages(user?.locale ?? 'en');
        await this.notifications.send(userId, {
          title: text.weeklyTitle,
          body: review,
          source: 'diary',
          // The answers to its questions go to today's entry.
          actions: [{label: text.weeklyAnswer, action: `${WEEKLY_ACTION}:a`}],
        });
      } catch (error) {
        // For example, the AI is not configured — skip this user, send to the rest.
        this.logger.warn(`Weekly diary summary failed for ${userId}: ${error}`);
      }
    }
  }

  async remind(): Promise<void> {
    await forEachUser(
      'diary.evening-reminder',
      await this.diary.usersToRemind(),
      async userId => {
        const user = await this.users.findById(userId);
        const text = diaryMessages(user?.locale ?? 'en');
        const day = this.diary.todayDate();
        await this.notifications.send(userId, {
          title: text.reminderTitle,
          body: text.reminderBody,
          source: 'diary',
          // One tap rates the day; the bot then asks for a few words.
          actions: [1, 2, 3, 4, 5].map(mood => ({
            label: MOOD_EMOJI[mood],
            action: `dmood:${day}:${mood}`,
          })),
        });
      },
    );
  }

  /** The next question of the evening check-in, with buttons 1–5. */
  private async askFeeling(
    userId: string,
    locale: string | null | undefined,
    kind: 'e' | 'a',
    day: string,
  ): Promise<void> {
    const text = diaryMessages(locale ?? 'en');
    await this.notifications.send(userId, {
      title: kind === 'e' ? text.energyTitle : text.anxietyTitle,
      body: kind === 'e' ? text.energyBody : text.anxietyBody,
      source: 'diary',
      // Asked right after the answer before it: the quiet hours do not hold it.
      now: true,
      actions: [1, 2, 3, 4, 5].map(score => ({
        label: String(score),
        action: `dfeel:${kind}:${day}:${score}`,
      })),
    });
  }
}

function isDay(day: string | undefined): day is string {
  return !!day && /^\d{4}-\d{2}-\d{2}$/.test(day);
}

function isScore(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 5;
}
