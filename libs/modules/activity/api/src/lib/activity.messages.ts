import { pickMessages } from '@pd/api-core';

/** "3 h 20 min" / "3 ч 20 мин". */
function hours(seconds: number, h: string, min: string): string {
  const minutes = Math.round(seconds / 60);
  const whole = Math.floor(minutes / 60);
  return whole > 0 ? `${whole} ${h} ${minutes % 60} ${min}` : `${minutes} ${min}`;
}

/** Texts of the notifications of the Activity section; the language follows `user.locale`. */
const messages = {
  en: {
    limitTitle: '⏳ Daily limit reached',
    limitGames: (used: number, limit: number) =>
      `${hours(used, 'h', 'min')} in games today — the limit is ${hours(limit, 'h', 'min')}.`,
    limitTotal: (used: number, limit: number) =>
      `${hours(used, 'h', 'min')} at the computer today — the limit is ${hours(limit, 'h', 'min')}.`,
    limitApp: (app: string, used: number, limit: number) =>
      `${hours(used, 'h', 'min')} in ${app} today — the limit is ${hours(limit, 'h', 'min')}.`,
    diskTitle: (computer: string) => `💽 ${computer}: running out of disk space`,
    diskBody: (disks: string) => `Less than a tenth free: ${disks}.`,
    gigabytes: 'GB free',
  },
  ru: {
    limitTitle: '⏳ Дневной лимит',
    limitGames: (used: number, limit: number) =>
      `Сегодня уже ${hours(used, 'ч', 'мин')} в играх — лимит ${hours(limit, 'ч', 'мин')}.`,
    limitTotal: (used: number, limit: number) =>
      `Сегодня уже ${hours(used, 'ч', 'мин')} за компьютером — лимит ${hours(limit, 'ч', 'мин')}.`,
    limitApp: (app: string, used: number, limit: number) =>
      `Сегодня уже ${hours(used, 'ч', 'мин')} в ${app} — лимит ${hours(limit, 'ч', 'мин')}.`,
    diskTitle: (computer: string) => `💽 ${computer}: заканчивается место на диске`,
    diskBody: (disks: string) => `Свободно меньше десятой части: ${disks}.`,
    gigabytes: 'ГБ свободно',
  },
};

export function activityMessages(locale: string | null | undefined) {
  return pickMessages(messages, locale ?? 'en');
}
