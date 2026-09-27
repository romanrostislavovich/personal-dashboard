import { pickMessages } from '@pd/api-core';
import { UpcomingBirthday } from '@pd/contracts';

/** Notification texts; the language is picked by `user.locale`. */
const messages = {
  en: {
    title: '🎂 Birthday',
    today: (b: UpcomingBirthday) =>
      `Today is ${b.name}'s birthday${b.turningAge ? ` — turning ${b.turningAge}` : ''}!`,
    soon: (b: UpcomingBirthday) =>
      `${b.name}'s birthday is in ${b.daysUntil} ${b.daysUntil === 1 ? 'day' : 'days'} ` +
      `(${formatDate(b.nextDate)})` +
      (b.turningAge ? `, turning ${b.turningAge}` : ''),
  },
  ru: {
    title: '🎂 День рождения',
    today: (b: UpcomingBirthday) =>
      `Сегодня день рождения у ${b.name}${b.turningAge ? ` — исполняется ${b.turningAge}` : ''}!`,
    soon: (b: UpcomingBirthday) =>
      `Через ${b.daysUntil} ${pluralDaysRu(b.daysUntil)} (${formatDate(b.nextDate)}) день рождения у ${b.name}` +
      (b.turningAge ? `, исполнится ${b.turningAge}` : ''),
  },
};

export function birthdayMessages(locale: string) {
  return pickMessages(messages, locale);
}

function pluralDaysRu(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'день';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'дня';
  return 'дней';
}

/** `2026-10-03` → `03.10`. */
function formatDate(localDate: string): string {
  const [, month, day] = localDate.split('-');
  return `${day}.${month}`;
}
