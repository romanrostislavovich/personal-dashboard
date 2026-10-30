import {Injectable} from '@nestjs/common';
import {UserRow} from '../users/users.schema';
import type {BotAction, BotActionReply} from './telegram/bot-command';

/** How long an answer waits for the words it asked for ("a few words about the film?"). */
const EXPECTED_TEXT_TTL_MS = 10 * 60 * 1000;

/** What a press of a button came to: the reply, and whether words are asked for now. */
export interface ActionResult {
  reply: string;
  expectsText: boolean;
}

interface ExpectedText {
  handler: (user: UserRow, text: string) => Promise<string>;
  expiresAt: number;
  /** The notification the words belong to; `null` — a button not of a notification. */
  notificationId: string | null;
}

/**
 * The handlers of the buttons under notifications, whatever the button was pressed in — Telegram,
 * the bell of the web app, the phone's notification (see NotificationInboxService). A module
 * registers them through `TelegramBotService.registerAction` as before; the handler gets the part
 * of the action after its name (`mv:r:<id>:8` → `r:<id>:8`).
 *
 * A handler may ask for words after the press (`expectText`): the next text the user writes —
 * in Telegram or in the bell — goes to it, once, within 10 minutes.
 */
@Injectable()
export class NotificationActions {
  private readonly actions: BotAction[] = [];
  private readonly expected = new Map<string, ExpectedText>();

  register(action: BotAction): void {
    this.actions.push(action);
  }

  /** Whether a handler takes this action (`name:…`). */
  handles(action: string): boolean {
    return this.find(action) !== undefined;
  }

  /** Runs the handler of `action`; `null` — none takes it. */
  async run(
    user: UserRow,
    action: string,
    notificationId: string | null = null,
  ): Promise<ActionResult | null> {
    const handler = this.find(action);
    if (!handler) {
      return null;
    }
    const payload = action.slice(handler.name.length + 1);
    return this.remember(
      user,
      await handler.handler(user, payload),
      notificationId,
    );
  }

  /**
   * The words asked for after a press, if they are awaited now (taken once); `null` — nothing
   * waits, the text is for someone else (the assistant). `notificationId` limits it to the words
   * of that notification.
   */
  async answerText(
    user: UserRow,
    text: string,
    notificationId?: string,
  ): Promise<{reply: string; notificationId: string | null} | null> {
    const expected = this.expected.get(user.id);
    if (!expected || expected.expiresAt <= Date.now()) {
      this.expected.delete(user.id);
      return null;
    }
    if (
      notificationId !== undefined &&
      expected.notificationId !== notificationId
    ) {
      return null;
    }
    this.expected.delete(user.id);
    return {
      reply: await expected.handler(user, text),
      notificationId: expected.notificationId,
    };
  }

  /** Whether words are awaited for this notification now. */
  awaitsText(userId: string, notificationId: string): boolean {
    const expected = this.expected.get(userId);
    return (
      !!expected &&
      expected.expiresAt > Date.now() &&
      expected.notificationId === notificationId
    );
  }

  /** Nothing waits any more: another button was pressed, another message came. */
  forget(userId: string): void {
    this.expected.delete(userId);
  }

  private remember(
    user: UserRow,
    result: BotActionReply,
    notificationId: string | null,
  ): ActionResult {
    if (typeof result === 'string') {
      this.expected.delete(user.id);
      return {reply: result, expectsText: false};
    }
    this.expected.set(user.id, {
      handler: result.expectText,
      expiresAt: Date.now() + EXPECTED_TEXT_TTL_MS,
      notificationId,
    });
    return {reply: result.reply, expectsText: true};
  }

  private find(action: string): BotAction | undefined {
    const name = action.split(':')[0];
    return this.actions.find(one => one.name === name);
  }
}
