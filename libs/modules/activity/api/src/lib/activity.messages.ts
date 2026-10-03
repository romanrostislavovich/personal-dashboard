import { pickMessages } from '@pd/api-core';
import { DaySummary } from './evening-summary';

/** "3 h 20 min" / "3 ч 20 мин". */
function hours(seconds: number, h: string, min: string): string {
  const minutes = Math.round(seconds / 60);
  const whole = Math.floor(minutes / 60);
  return whole > 0 ? `${whole} ${h} ${minutes % 60} ${min}` : `${minutes} ${min}`;
}

const CATEGORY_EN: Record<string, string> = {
  development: 'Development',
  browsing: 'Browser',
  communication: 'Communication',
  office: 'Documents',
  design: 'Design',
  games: 'Games',
  media: 'Music and video',
  meetings: 'Meetings',
  system: 'System',
  other: 'Other',
};
const CATEGORY_RU: Record<string, string> = {
  development: 'Разработка',
  browsing: 'Браузер',
  communication: 'Общение',
  office: 'Документы',
  design: 'Дизайн',
  games: 'Игры',
  media: 'Музыка и видео',
  meetings: 'Встречи',
  system: 'Система',
  other: 'Прочее',
};

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
    diskHealthTitle: (computer: string) => `⚠️ ${computer}: a disk is failing`,
    diskHealthBody: (disks: string) =>
      `Windows marks it as not healthy: ${disks}. Back up what matters from it now.`,
    heatTitle: (computer: string) => `🔥 ${computer} is overheating`,
    heatBody:
      'For a quarter of an hour Windows has been slowing the processor down to cool it. ' +
      'Check the vents and the fan, or give it a break.',
    rebootTitle: (computer: string) => `🔄 ${computer} has not been restarted for long`,
    rebootBody: (days: number) =>
      `It has been running for ${days} days without a restart: Windows updates wait for one.`,
    batteryFullTitle: (computer: string) => `🔋 ${computer}: the battery sits at 100%`,
    batteryFullBody:
      'The laptop has been on mains power at a full charge most of the week, and that wears a ' +
      'battery out fastest. Most laptops can stop charging at about 80%: Lenovo Vantage — ' +
      'Conservation mode; MyASUS — Battery Health Charging; Dell Power Manager — Primarily AC use; ' +
      'HP — Adaptive Battery Optimizer; Huawei PC Manager — Smart charge.',
    batteryHealthTitle: (computer: string) => `🔋 ${computer}: the battery is wearing out`,
    batteryHealthBody: (percent: number) =>
      `It holds ${percent}% of the charge it held when new. Under 60% a replacement is worth thinking about.`,
    summaryTitle: (seconds: number) => `🌙 The day: ${hours(seconds, 'h', 'min')} at the computer`,
    summaryBody: (summary: DaySummary) =>
      [
        summary.categories
          .map((c) => `${CATEGORY_EN[c.category] ?? c.category} ${hours(c.seconds, 'h', 'min')}`)
          .join(' · '),
        summary.focus.completed
          ? `Focus: ${summary.focus.completed} sessions, ${hours(summary.focus.seconds, 'h', 'min')}`
          : '',
        ...summary.limits.map(
          (l) => `Limit reached: ${l.label} (${hours(l.minutes * 60, 'h', 'min')})`,
        ),
      ]
        .filter(Boolean)
        .join('\n'),
    limitLabel: (kind: string, app: string | null) =>
      kind === 'games' ? 'games' : kind === 'total' ? 'the whole day' : (app ?? ''),
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
    diskHealthTitle: (computer: string) => `⚠️ ${computer}: диск неисправен`,
    diskHealthBody: (disks: string) =>
      `Windows помечает его как нездоровый: ${disks}. Сохраните с него важное прямо сейчас.`,
    heatTitle: (computer: string) => `🔥 ${computer} перегревается`,
    heatBody:
      'Уже четверть часа Windows замедляет процессор, чтобы охладить его. ' +
      'Проверьте вентиляционные отверстия и кулер или дайте ему отдохнуть.',
    rebootTitle: (computer: string) => `🔄 ${computer} давно не перезагружался`,
    rebootBody: (days: number) =>
      `Работает без перезагрузки уже ${days} дн.: обновления Windows ждут её.`,
    batteryFullTitle: (computer: string) => `🔋 ${computer}: батарея всё время на 100%`,
    batteryFullBody:
      'Ноутбук почти всю неделю от сети на полном заряде — так батарея изнашивается быстрее ' +
      'всего. Большинство ноутбуков умеют останавливать зарядку на ~80%: Lenovo Vantage — ' +
      'режим сохранения батареи; MyASUS — Battery Health Charging; Dell Power Manager — ' +
      'Primarily AC use; HP — Adaptive Battery Optimizer; Huawei PC Manager — умная зарядка.',
    batteryHealthTitle: (computer: string) => `🔋 ${computer}: батарея изнашивается`,
    batteryHealthBody: (percent: number) =>
      `Она держит ${percent}% от заряда, который держала новой. Ниже 60% стоит задуматься о замене.`,
    summaryTitle: (seconds: number) => `🌙 Итог дня: ${hours(seconds, 'ч', 'мин')} за компьютером`,
    summaryBody: (summary: DaySummary) =>
      [
        summary.categories
          .map((c) => `${CATEGORY_RU[c.category] ?? c.category} ${hours(c.seconds, 'ч', 'мин')}`)
          .join(' · '),
        summary.focus.completed
          ? `Фокус: ${summary.focus.completed} сес., ${hours(summary.focus.seconds, 'ч', 'мин')}`
          : '',
        ...summary.limits.map(
          (l) => `Лимит превышен: ${l.label} (${hours(l.minutes * 60, 'ч', 'мин')})`,
        ),
      ]
        .filter(Boolean)
        .join('\n'),
    limitLabel: (kind: string, app: string | null) =>
      kind === 'games' ? 'игры' : kind === 'total' ? 'весь день' : (app ?? ''),
  },
};

export function activityMessages(locale: string | null | undefined) {
  return pickMessages(messages, locale ?? 'en');
}
