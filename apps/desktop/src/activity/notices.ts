import { TrackerNotice } from './tracker';

/** The text of a notification of the tracker (the shell speaks Russian, like its tray menu). */
export function noticeText(notice: TrackerNotice): { title: string; body: string } {
  switch (notice.kind) {
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
  }
}
