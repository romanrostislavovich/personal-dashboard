import { UpcomingBirthday } from '@pd/contracts';

/**
 * Тексты уведомлений. Чтобы добавить язык — добавь ключ (`en: {...}`);
 * язык выбирается по `user.locale`, по умолчанию `ru`.
 */
const messages = {
  ru: {
    title: '🎂 День рождения',
    today: (b: UpcomingBirthday) =>
      `Сегодня день рождения у ${b.name}${b.turningAge ? ` — исполняется ${b.turningAge}` : ''}!`,
    soon: (b: UpcomingBirthday) =>
      `Через ${b.daysUntil} ${pluralDays(b.daysUntil)} (${formatDate(b.nextDate)}) день рождения у ${b.name}` +
      (b.turningAge ? `, исполнится ${b.turningAge}` : ''),
  },
};

export function birthdayMessages(locale: string) {
  return messages[locale as keyof typeof messages] ?? messages.ru;
}

function pluralDays(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'день';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'дня';
  return 'дней';
}

function formatDate(localDate: string): string {
  const [, month, day] = localDate.split('-');
  return `${day}.${month}`;
}
