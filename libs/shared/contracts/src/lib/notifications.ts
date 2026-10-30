import {z} from 'zod';

export interface NotificationSettings {
  telegram: {
    /** The bot is running: the owner set its token (Settings → Notifications). */
    available: boolean;
    /** The user has linked their Telegram chat. */
    connected: boolean;
    /** For the owner, who sets the bot; `null` for the others. */
    bot: TelegramBotState | null;
  };
}

export interface TelegramBotState {
  tokenSet: boolean;
  /** The bot's name in Telegram, once it runs. */
  username: string | null;
  /** Why the bot with this token did not start. */
  error: string | null;
}

/** `PUT /api/notifications/telegram/bot`: the token @BotFather gave (`123456:ABC…`). */
export const telegramBotInputSchema = z.object({
  token: z
    .string()
    .trim()
    .regex(/^\d{5,}:[\w-]{30,}$/),
});
export type TelegramBotInput = z.infer<typeof telegramBotInputSchema>;

export interface TelegramLinkResponse {
  /** A link like https://t.me/<bot>?start=<code>; open it and press "Start". */
  deepLink: string;
  expiresAt: string;
}

/**
 * What became of a notification: `sending` — on its way now; `pending` — a channel failed and it
 * is tried again later; `deduplicated` — the same one went out a moment ago, so not again;
 * `held` — made in the user's quiet hours, it waits for their end (see CalmSettings).
 */
export const NOTIFICATION_DELIVERY_STATUSES = [
  'held',
  'sending',
  'pending',
  'sent',
  'failed',
  'deduplicated',
] as const;
export type NotificationDeliveryStatus =
  (typeof NOTIFICATION_DELIVERY_STATUSES)[number];

/** A line of the delivery log (Settings → Notifications). */
export interface NotificationDelivery {
  id: string;
  source: string;
  title: string;
  status: NotificationDeliveryStatus;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: string | null;
  createdAt: string;
  sentAt: string | null;
}

/** `GET /api/notifications/log`: the latest notifications and the counts of the last week. */
export interface NotificationLog {
  items: NotificationDelivery[];
  week: Record<NotificationDeliveryStatus, number>;
}

/** A button of a notification: what it says, and the action it answers with (`mv:r:<id>:8`). */
export interface InboxAction {
  label: string;
  action: string;
  /** Starts a row of its own (ratings 1–5 and 6–10). */
  newRow?: boolean;
}

/** Where a question was answered (see InboxItem). */
export const INBOX_ANSWER_CHANNELS = ['web', 'telegram', 'push'] as const;
export type InboxAnswerChannel = (typeof INBOX_ANSWER_CHANNELS)[number];

/**
 * A notification in the bell (the inbox): everything that went to Telegram or the phone, on every
 * device the same — read or not, and a question's answer, wherever it was given.
 */
export interface InboxItem {
  id: string;
  /** The module that sent it (`movies`, `habits`…). */
  source: string;
  title: string;
  body: string;
  /** The page of its section (or the one it named). */
  link: string;
  actions: InboxAction[];
  createdAt: string;
  readAt: string | null;
  answeredAt: string | null;
  /** The button pressed (its label) and the words written after it, if any. */
  answer: string | null;
  answeredVia: InboxAnswerChannel | null;
  /** A question still waiting for an answer: it has buttons, none pressed, not too old. */
  waiting: boolean;
  /** Its answer asked for a few words, and they are awaited now (a note to the rating). */
  awaitsWords: boolean;
}

/** `GET /api/notifications/inbox`: the newest first, `before` pages back. */
export const inboxQuerySchema = z.object({
  /** `questions` — only the ones waiting for an answer. */
  filter: z.enum(['all', 'questions']).default('all'),
  before: z.iso.datetime().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(30),
});
/** The query as the server reads it, with its defaults. */
export type InboxQueryParsed = z.infer<typeof inboxQuerySchema>;
/** What a client may send: any of it. */
export type InboxQuery = Partial<InboxQueryParsed>;

/** The bell's numbers. */
export interface InboxSummary {
  unread: number;
  /** Questions waiting for an answer. */
  waiting: number;
}

/** `POST /api/notifications/inbox/:id/answer`: a button pressed, or the words asked for after it. */
export const inboxAnswerSchema = z.union([
  z.object({action: z.string().min(1).max(64)}),
  z.object({text: z.string().trim().min(1).max(4000)}),
]);
export type InboxAnswerInput = z.infer<typeof inboxAnswerSchema>;

/** `POST /api/notifications/inbox/:id/push-answer`: a button of the phone's shade. */
export const pushAnswerSchema = z.object({
  action: z.string().min(1).max(64),
  token: z.string().min(16).max(128),
});
export type PushAnswerInput = z.infer<typeof pushAnswerSchema>;

export interface InboxAnswerResult {
  /** What the section said back ("Saved: 8/10"). */
  reply: string;
  /** The section asks for a few words now (a note to the rating). */
  expectsText: boolean;
  item: InboxItem;
}
