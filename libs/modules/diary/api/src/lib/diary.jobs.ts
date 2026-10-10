import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  NotificationsService,
  SchedulerService,
  TelegramBotService,
  UsersService,
} from '@pd/api-core';
import { diaryMessages } from './diary.messages';
import { DiarySummaryService } from './diary-summary.service';
import { DiaryPhotosService } from './diary-photos.service';
import { DiaryService } from './diary.service';

const MOOD_EMOJI = ['', '😞', '😕', '😐', '🙂', '😄'];
/** Telegram rejects messages longer than 4096 characters. */
const TELEGRAM_MAX_LENGTH = 4000;

/**
 * Connects the diary to the outside world:
 * - bot commands: `/d text` appends a note to today's entry, `/mood 4` rates the day,
 *   `/today` shows today's entry; a photo sent to the bot is added to today's entry;
 * - at 21:00, an evening check-in for those who enabled it and have not written today: the
 *   bot asks how the day was, a button sets the mood, the next message goes to the entry;
 * - on Sundays at 20:00, an AI summary of the week (for those who enabled it).
 */
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
      handler: async (user) => {
        const entry = await this.diary.todayEntry(user.id);
        if (!entry?.content.trim() && !entry?.mood) {
          return diaryMessages(user.locale).todayEmpty;
        }
        const text = [entry.mood ? MOOD_EMOJI[entry.mood] : '', entry.content.trim()]
          .filter(Boolean)
          .join('\n\n');
        return text.length > TELEGRAM_MAX_LENGTH ? `${text.slice(0, TELEGRAM_MAX_LENGTH)}…` : text;
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
      { id: 'diary', label: { en: '📔 To the diary', ru: '📔 В дневник' } },
    );

    // The buttons under the evening question: `dmood:<day>:<1–5>`. The day is in the button, so
    // an answer after midnight still goes to the day that was asked about.
    this.telegram.registerAction({
      name: 'dmood',
      handler: async (user, payload) => {
        const [day, value] = payload.split(':');
        const mood = Number(value);
        const replies = diaryMessages(user.locale);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isInteger(mood) || mood < 1 || mood > 5) {
          return replies.moodUsage;
        }
        await this.diary.setMood(user.id, day, mood);
        return {
          reply: replies.checkInAskWords(MOOD_EMOJI[mood]),
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

    this.scheduler.register({
      name: 'diary.weekly-summary',
      cron: '0 20 * * 0',
      handler: () => this.sendWeeklySummaries(),
    });
  }

  async sendWeeklySummaries(): Promise<void> {
    for (const userId of await this.diary.usersWithWeeklySummary()) {
      try {
        const summary = await this.summaries.summarize(userId, this.diary.lastWeek());
        if (!summary) {
          continue;
        }
        const user = await this.users.findById(userId);
        await this.notifications.send(userId, {
          title: diaryMessages(user?.locale ?? 'en').weeklyTitle,
          body: summary,
          source: 'diary',
        });
      } catch (error) {
        // For example, the AI is not configured — skip this user, send to the rest.
        this.logger.warn(`Weekly diary summary failed for ${userId}: ${error}`);
      }
    }
  }

  async remind(): Promise<void> {
    for (const userId of await this.diary.usersToRemind()) {
      const user = await this.users.findById(userId);
      const text = diaryMessages(user?.locale ?? 'en');
      const day = this.diary.todayDate();
      await this.notifications.send(userId, {
        title: text.reminderTitle,
        body: text.reminderBody,
        source: 'diary',
        // One tap rates the day; the bot then asks for a few words.
        actions: [1, 2, 3, 4, 5].map((mood) => ({
          label: MOOD_EMOJI[mood],
          action: `dmood:${day}:${mood}`,
        })),
      });
    }
  }
}
