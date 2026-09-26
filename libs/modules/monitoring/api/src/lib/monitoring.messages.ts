import { MonitorNotice, SslNotice } from './checker.service';

/** Тексты уведомлений модуля; язык выбирается по `user.locale`. */
const messages = {
  ru: {
    downTitle: (n: MonitorNotice) => `🔴 ${n.projectName} недоступен`,
    downBody: (n: MonitorNotice) => `${n.url}\nПричина: ${describeError(n.error)}`,
    recoveredTitle: (n: MonitorNotice) => `🟢 ${n.projectName} снова работает`,
    recoveredBody: (n: MonitorNotice, downtimeMs: number) =>
      `${n.url}\nПростой: ${formatDuration(downtimeMs)}`,
    sslTitle: (n: SslNotice) => `🔒 SSL-сертификат ${n.projectName}`,
    sslBody: (n: SslNotice, daysLeft: number) =>
      daysLeft > 0
        ? `${n.url}\nИстекает через ${daysLeft} дн. (${n.expiresAt.toLocaleDateString('ru')})`
        : `${n.url}\nСертификат истёк ${n.expiresAt.toLocaleDateString('ru')}!`,
  },
};

export function monitoringMessages(locale: string) {
  return messages[locale as keyof typeof messages] ?? messages.ru;
}

/** Сетевые коды ошибок Node.js → понятный текст. */
const NETWORK_ERRORS: Record<string, string> = {
  ENOTFOUND: 'домен не найден (DNS)',
  ECONNREFUSED: 'сервер отклонил соединение',
  ECONNRESET: 'соединение сброшено',
  ETIMEDOUT: 'нет ответа от сервера',
  CERT_HAS_EXPIRED: 'истёк SSL-сертификат',
};

function describeError(error: string | null): string {
  if (!error) {
    return 'неизвестно';
  }
  return NETWORK_ERRORS[error] ? `${NETWORK_ERRORS[error]} (${error})` : error;
}

function formatDuration(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) {
    return `${minutes} мин`;
  }
  const hours = Math.floor(minutes / 60);
  return `${hours} ч ${minutes % 60} мин`;
}
