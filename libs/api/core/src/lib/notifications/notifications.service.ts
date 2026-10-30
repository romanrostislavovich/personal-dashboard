import {Inject, Injectable, Logger, OnModuleInit} from '@nestjs/common';
import {isMuted, NO_CALM, quietMinutesLeft, zonedDateTime} from '@pd/contracts';
import {coreMessages} from '../i18n/core.messages';
import {SchedulerService} from '../scheduler/scheduler.service';
import {UserRow} from '../users/users.schema';
import {UsersService} from '../users/users.service';
import {
  DeliveryError,
  Notification,
  NOTIFICATION_CHANNELS,
  NotificationChannel,
} from './notification-channel';
import {heldTitle} from './held-title';
import {NotificationActions} from './notification-actions';
import {sectionOfSource} from './notification-link';
import {NotificationOutbox} from './notification-outbox';
import {NotificationOutboxRow} from './notifications.schema';

/** The night's message lists this many; the rest are counted. */
const QUIET_LIST_MAX = 15;
/** A line of the night's message is cut to this. */
const QUIET_LINE_MAX = 160;

/**
 * Single entry point for sending notifications from all modules.
 * A module does not know where the message goes — it just calls `send`.
 *
 * Every notification is written down first (NotificationOutbox): the same one within its
 * window goes out once, and a channel that failed is tried again by a job with a backoff.
 */
@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly users: UsersService,
    private readonly outbox: NotificationOutbox,
    private readonly scheduler: SchedulerService,
    @Inject(NOTIFICATION_CHANNELS)
    private readonly channels: NotificationChannel[],
    private readonly actions: NotificationActions,
  ) {}

  onModuleInit(): void {
    this.scheduler.register({
      name: 'notifications.retry',
      cron: '* * * * *',
      quiet: true,
      handler: () => this.retryDue(),
    });
    this.scheduler.register({
      name: 'notifications.quiet-end',
      cron: '* * * * *',
      quiet: true,
      handler: () => this.releaseHeld(),
    });
    this.scheduler.register({
      name: 'notifications.prune',
      cron: '40 4 * * *',
      handler: () => this.outbox.prune(),
    });
  }

  async send(userId: string, notification: Notification): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user) {
      return;
    }
    // A section the user hid (Settings → Appearance) stays quiet too, not only out of the menu.
    if (
      this.users
        .hiddenSections(user)
        .includes(sectionOfSource(notification.source))
    ) {
      return;
    }

    const section = sectionOfSource(notification.source);
    // A section kept off Telegram or the phone (Settings → Notifications) skips just that one.
    const channels = this.channels.filter(
      channel =>
        channel.isEnabledFor(user) &&
        !isMuted(user.calm, section, channel.name),
    );
    const durable = channels
      .filter(channel => channel.durable)
      .map(channel => channel.name);
    // The user's quiet hours: Telegram and the phone wait for their end; a toast in a tab the
    // user has open now still shows — they are looking anyway.
    const quietUntil = notification.now ? null : this.quietUntil(user);
    // The desktop app's system notification: like the phone's push, quiet in the quiet hours
    // and off for a section kept off the computer; the toast in the window shows anyway.
    notification = {
      ...notification,
      desktop: !quietUntil && !isMuted(user.calm, section, 'desktop'),
    };
    if (quietUntil && durable.length) {
      const held = await this.outbox.add(
        userId,
        notification,
        durable,
        'held',
        null,
        quietUntil,
      );
      await this.sendNow(user, {...notification, id: held?.id}, channels);
      return;
    }
    const row = await this.outbox.add(
      userId,
      notification,
      durable,
      durable.length ? 'sending' : channels.length ? 'sent' : 'failed',
      channels.length
        ? null
        : 'No channel: Telegram is not connected and no tab is open',
    );
    if (!row) {
      return;
    }
    if (channels.length === 0) {
      this.logger.warn(
        `No notification channels for user ${user.email}: "${notification.title}"`,
      );
      return;
    }
    await this.sendNow(user, {...notification, id: row.id}, channels);
    if (durable.length) {
      await this.deliver(user, row);
    }
  }

  /** A toast is shown now or never: it is not tried again. */
  private async sendNow(
    user: UserRow,
    notification: Notification,
    channels: NotificationChannel[],
  ): Promise<void> {
    await Promise.all(
      channels
        .filter(channel => !channel.durable)
        .map(channel =>
          channel
            .send(user, notification)
            .catch(error =>
              this.logger.error(`Channel ${channel.name} failed: ${error}`),
            ),
        ),
    );
  }

  /** When the user's quiet hours end, if they are in them now; `null` — not quiet now. */
  private quietUntil(user: UserRow, now = new Date()): Date | null {
    const {time} = zonedDateTime(now, this.users.timeZoneOf(user));
    const [hours, minutes] = time.split(':').map(Number);
    const left = quietMinutesLeft(
      (user.calm ?? NO_CALM).quietHours,
      hours * 60 + minutes,
    );
    if (!left) {
      return null;
    }
    const end = new Date(now.getTime() + left * 60_000);
    end.setSeconds(0, 0);
    return end;
  }

  /**
   * The quiet hours are over (every minute): what each user got during them goes out as one
   * message to the channels they had (one alone as it was). A question with buttons never goes
   * into that summary — its buttons would be lost ("A day without alcohol?" came as a line of the
   * list on 2026-10-27): it follows the summary on its own, with the day it is about when that is
   * not today.
   */
  async releaseHeld(now = new Date()): Promise<void> {
    const byUser = new Map<string, NotificationOutboxRow[]>();
    for (const row of await this.outbox.claimHeld()) {
      byUser.set(row.userId, [...(byUser.get(row.userId) ?? []), row]);
    }
    for (const [userId, rows] of byUser) {
      const user = await this.users.findById(userId);
      if (!user) {
        continue;
      }
      const questions = rows.filter(row => row.actions.length);
      const rest = rows.filter(row => !row.actions.length);
      if (rest.length === 1) {
        await this.deliver(user, rest[0]);
      } else if (rest.length) {
        await this.deliverNight(user, rest);
      }
      const text = coreMessages(user.locale);
      const words = {yesterday: text.heldYesterday, earlier: text.heldEarlier};
      for (const row of questions) {
        // Answered in the bell at night, or closed some other way (the diary reminder of 21:00
        // came again at 09:00 on 2026-10-30 after the day was written): nothing to ask.
        if (row.answeredAt || (await this.settled(user, row))) {
          await this.outbox.delivered(row.id);
          continue;
        }
        const title = heldTitle(
          row.title,
          row.createdAt,
          now,
          this.users.timeZoneOf(user),
          words,
        );
        await this.deliver(user, {...row, title});
      }
    }
  }

  /** Whether the section says its question was closed meanwhile; a failed check asks anyway. */
  private async settled(
    user: UserRow,
    row: NotificationOutboxRow,
  ): Promise<boolean> {
    try {
      return await this.actions.settled(user, row.actions[0].action);
    } catch (error) {
      this.logger.warn(`A held question was not checked: ${error}`);
      return false;
    }
  }

  /** The night in one message; if it fails, each goes back to be tried on its own. */
  private async deliverNight(
    user: UserRow,
    rows: NotificationOutboxRow[],
  ): Promise<void> {
    const cut = (text: string) =>
      text.length > QUIET_LINE_MAX ? `${text.slice(0, QUIET_LINE_MAX)}…` : text;
    const lines = rows
      .slice(0, QUIET_LIST_MAX)
      .map(row => `• ${cut(`${row.title}: ${row.body}`.replace(/\s+/g, ' '))}`);
    if (rows.length > QUIET_LIST_MAX) {
      lines.push(`… +${rows.length - QUIET_LIST_MAX}`);
    }
    const night: Notification = {
      title: coreMessages(user.locale).quietTitle(rows.length),
      body: lines.join('\n'),
      source: 'core',
    };
    const names = [...new Set(rows.flatMap(row => row.channels))];
    let failure: unknown = null;
    for (const name of names) {
      const channel = this.channels.find(one => one.name === name);
      if (!channel?.isEnabledFor(user)) {
        continue;
      }
      try {
        await channel.send(user, night);
      } catch (error) {
        failure = error;
      }
    }
    for (const row of rows) {
      if (failure) {
        const error =
          failure instanceof DeliveryError
            ? failure
            : new DeliveryError(String(failure));
        await this.outbox.failed(
          row,
          row.channels,
          error.message,
          error.options,
        );
      } else {
        await this.outbox.delivered(row.id);
      }
    }
  }

  /** The ones that failed before and whose time has come (every minute). */
  async retryDue(): Promise<void> {
    for (const row of await this.outbox.claimDue()) {
      const user = await this.users.findById(row.userId);
      if (user) {
        await this.deliver(user, row);
      }
    }
  }

  /** To the channels the row still has to reach; one failing does not stop the others. */
  private async deliver(
    user: UserRow,
    row: NotificationOutboxRow,
  ): Promise<void> {
    const notification: Notification = {
      id: row.id,
      title: row.title,
      body: row.body,
      source: row.source,
      actions: row.actions,
      ...(row.link ? {link: row.link} : {}),
    };
    const remaining: string[] = [];
    const errors: DeliveryError[] = [];
    for (const name of row.channels) {
      const channel = this.channels.find(one => one.name === name);
      if (!channel?.isEnabledFor(user)) {
        // Disconnected since: nothing to try again.
        continue;
      }
      try {
        const receipt = await channel.send(user, notification);
        // Its buttons go once it is answered elsewhere (NotificationInboxService).
        if (receipt?.telegram && row.actions.length) {
          await this.outbox.setTelegramMessage(row.id, receipt.telegram);
        }
      } catch (error) {
        const failure =
          error instanceof DeliveryError
            ? error
            : new DeliveryError(String(error));
        this.logger.warn(
          `Channel ${name} failed (try ${row.attempts + 1}): ${failure.message}`,
        );
        if (!failure.options.permanent) {
          remaining.push(name);
        }
        errors.push(failure);
      }
    }
    if (!errors.length) {
      await this.outbox.delivered(row.id);
      return;
    }
    await this.outbox.failed(
      row,
      remaining,
      errors.map(error => error.message).join('; '),
      {
        retryAfterMs: Math.max(
          0,
          ...errors.map(error => error.options.retryAfterMs ?? 0),
        ),
        permanent: remaining.length === 0,
      },
    );
  }
}
