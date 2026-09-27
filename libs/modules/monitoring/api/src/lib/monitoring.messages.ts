import { pickMessages } from '@pd/api-core';
import { MonitorNotice, SslNotice } from './checker.service';

/** Module notification texts; the language is picked by `user.locale`. */
const messages = {
  en: {
    downTitle: (n: MonitorNotice) => `🔴 ${n.projectName} is down`,
    downBody: (n: MonitorNotice) =>
      `${n.url}\nReason: ${describeError(n.error, NETWORK_ERRORS_EN, 'unknown')}`,
    recoveredTitle: (n: MonitorNotice) => `🟢 ${n.projectName} is back up`,
    recoveredBody: (n: MonitorNotice, downtimeMs: number) =>
      `${n.url}\nDowntime: ${formatDuration(downtimeMs, 'min', 'h')}`,
    sslTitle: (n: SslNotice) => `🔒 SSL certificate of ${n.projectName}`,
    sslBody: (n: SslNotice, daysLeft: number) =>
      daysLeft > 0
        ? `${n.url}\nExpires in ${daysLeft} days (${n.expiresAt.toLocaleDateString('en')})`
        : `${n.url}\nThe certificate expired on ${n.expiresAt.toLocaleDateString('en')}!`,
  },
  ru: {
    downTitle: (n: MonitorNotice) => `🔴 ${n.projectName} недоступен`,
    downBody: (n: MonitorNotice) =>
      `${n.url}\nПричина: ${describeError(n.error, NETWORK_ERRORS_RU, 'неизвестно')}`,
    recoveredTitle: (n: MonitorNotice) => `🟢 ${n.projectName} снова работает`,
    recoveredBody: (n: MonitorNotice, downtimeMs: number) =>
      `${n.url}\nПростой: ${formatDuration(downtimeMs, 'мин', 'ч')}`,
    sslTitle: (n: SslNotice) => `🔒 SSL-сертификат ${n.projectName}`,
    sslBody: (n: SslNotice, daysLeft: number) =>
      daysLeft > 0
        ? `${n.url}\nИстекает через ${daysLeft} дн. (${n.expiresAt.toLocaleDateString('ru')})`
        : `${n.url}\nСертификат истёк ${n.expiresAt.toLocaleDateString('ru')}!`,
  },
};

export function monitoringMessages(locale: string) {
  return pickMessages(messages, locale);
}

/** Node.js network error codes → readable text. */
const NETWORK_ERRORS_EN: Record<string, string> = {
  ENOTFOUND: 'domain not found (DNS)',
  ECONNREFUSED: 'connection refused',
  ECONNRESET: 'connection reset',
  ETIMEDOUT: 'no response from the server',
  CERT_HAS_EXPIRED: 'SSL certificate expired',
};

const NETWORK_ERRORS_RU: Record<string, string> = {
  ENOTFOUND: 'домен не найден (DNS)',
  ECONNREFUSED: 'сервер отклонил соединение',
  ECONNRESET: 'соединение сброшено',
  ETIMEDOUT: 'нет ответа от сервера',
  CERT_HAS_EXPIRED: 'истёк SSL-сертификат',
};

function describeError(
  error: string | null,
  known: Record<string, string>,
  unknown: string,
): string {
  if (!error) {
    return unknown;
  }
  return known[error] ? `${known[error]} (${error})` : error;
}

function formatDuration(ms: number, minutesUnit: string, hoursUnit: string): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) {
    return `${minutes} ${minutesUnit}`;
  }
  return `${Math.floor(minutes / 60)} ${hoursUnit} ${minutes % 60} ${minutesUnit}`;
}
