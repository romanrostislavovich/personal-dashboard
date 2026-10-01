import { pickMessages } from '@pd/api-core';

/** Module texts for notifications and bot replies; the language is picked by `user.locale`. */
const messages = {
  en: {
    reminderTitle: '⏰ Reminder',
    buttons: {
      done: '✓ Done',
      hour: 'In an hour',
      tomorrow: 'Tomorrow 9:00',
      other: 'Another time…',
    },
    done: '✓ Done.',
    snoozed: (when: string) => `⏰ I will remind you ${when}.`,
    askWhen: 'When should I remind you? For example: "tomorrow 18:30", "05.10 9:00", "in 2 hours".',
    notUnderstood:
      'I did not get the time. Press "Another time…" again and write, for example, "tomorrow 18:30".',
    gone: 'This reminder is no longer there.',
    todoUsage: 'Write the task after the command: /todo buy milk #home',
    todoAdded: (title: string) => `✓ Task added: ${title}`,
    remindUsage:
      'Write when and what: /remind tomorrow 9:00 call mum. Also: "in 2 hours", "05.10 18:30", "18:00".',
    remindAdded: (when: string, text: string) => `⏰ I will remind you ${when}: ${text}`,
    tasksNone: 'Nothing for today. 🎉',
    tasksOverdue: 'Overdue',
    tasksToday: 'Today',
  },
  ru: {
    reminderTitle: '⏰ Напоминание',
    buttons: {
      done: '✓ Готово',
      hour: 'Через час',
      tomorrow: 'Завтра в 9:00',
      other: 'Другое время…',
    },
    done: '✓ Готово.',
    snoozed: (when: string) => `⏰ Напомню ${when}.`,
    askWhen: 'Когда напомнить? Например: «завтра 18:30», «05.10 9:00», «через 2 часа».',
    notUnderstood:
      'Не понял время. Нажми «Другое время…» ещё раз и напиши, например, «завтра 18:30».',
    gone: 'Этого напоминания уже нет.',
    todoUsage: 'Напиши задачу после команды: /todo купить молоко #дом',
    todoAdded: (title: string) => `✓ Задача добавлена: ${title}`,
    remindUsage:
      'Напиши когда и что: /remind завтра 9:00 позвонить маме. Ещё можно: «через 2 часа», «05.10 18:30», «18:00».',
    remindAdded: (when: string, text: string) => `⏰ Напомню ${when}: ${text}`,
    tasksNone: 'На сегодня ничего. 🎉',
    tasksOverdue: 'Просрочено',
    tasksToday: 'Сегодня',
  },
};

export function tasksMessages(locale: string | null | undefined) {
  return pickMessages(messages, locale ?? 'en');
}

/** "3 Oct, 18:30" on the user's own clock, in their language. */
export function formatWhen(at: Date, timeZone: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(at);
}
