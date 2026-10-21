import { TrackerNotice } from './tracker';

/** Legacy tray notices are Russian; optional smart suggestions follow the system locale. */
export function noticeText(notice: TrackerNotice, locale = 'ru'): { title: string; body: string } {
  switch (notice.kind) {
    case 'smart-break':
      return locale.toLowerCase().startsWith('ru')
        ? {
            title: 'Удобный момент для перерыва',
            body: 'Задача завершена. После 50 минут активности можно ненадолго отвлечься, если вам удобно.',
          }
        : {
            title: 'A good moment for a break',
            body: 'Task completed. After 50 minutes of activity, consider a short break if it suits you.',
          };
    case 'break':
      return {
        title: 'Пора размяться',
        body: `${notice.minutes} мин за компьютером без перерыва. Встаньте, пройдитесь, посмотрите вдаль.`,
      };
    case 'focus-ended': {
      const held = notice.held ? ` Пока шёл фокус, пришло уведомлений: ${notice.held}.` : '';
      return {
        title: notice.next === 'long-break' ? 'Фокус завершён — длинный перерыв' : 'Фокус завершён',
        body: `Перерыв ${notice.minutes} мин.${held}`,
      };
    }
    case 'break-ended':
      return {
        title: 'Перерыв окончен',
        body: 'Нажмите, чтобы начать следующий фокус.',
      };
    case 'meeting-ended':
      return {
        title: 'Звонок закончился',
        body: `Пока он шёл, пришло уведомлений: ${notice.held}. Они в дашборде.`,
      };
  }
}
