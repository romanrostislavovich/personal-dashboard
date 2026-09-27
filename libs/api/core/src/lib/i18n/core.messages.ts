import { pickMessages } from './locale';

/** Core texts: bot replies, service notifications, AI. */
const messages = {
  en: {
    telegramLinked: '✅ Done! Dashboard notifications will now arrive here.',
    telegramLinkExpired: 'The link has expired. Create a new one in the dashboard settings.',
    telegramNotLinked: 'Connect Telegram in the dashboard settings first.',
    testNotification: 'Test notification: everything works 🎉',
    achievementsTitle: '🏆 New achievements',
    morningDigestTitle: '☀️ Good morning',
    aiLanguage: 'English',
    askUsage: 'Write a question after the command, e.g. /ask what birthdays are this week?',
    askNotConfigured: 'AI is not configured: open the “AI” section of the dashboard and add a key.',
    askDescription: 'Ask AI about your data: /ask how much did I spend in September?',
  },
  ru: {
    telegramLinked: '✅ Готово! Теперь уведомления дашборда будут приходить сюда.',
    telegramLinkExpired: 'Ссылка устарела. Создай новую в настройках дашборда.',
    telegramNotLinked: 'Сначала подключи Telegram в настройках дашборда.',
    testNotification: 'Тестовое уведомление: всё работает 🎉',
    achievementsTitle: '🏆 Новые ачивки',
    morningDigestTitle: '☀️ Доброе утро',
    aiLanguage: 'Russian',
    askUsage: 'Напиши вопрос после команды, например: /ask какие дни рождения на этой неделе?',
    askNotConfigured: 'AI не настроен: открой раздел «AI» в дашборде и укажи ключ.',
    askDescription: 'Вопрос AI по твоим данным: /ask сколько я потратил в сентябре?',
  },
};

export function coreMessages(locale: string | null | undefined) {
  return pickMessages(messages, locale);
}
