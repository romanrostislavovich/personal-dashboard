import { pickMessages } from './locale';

/** Core texts: bot replies, service notifications, AI. */
const messages = {
  en: {
    telegramLinked: '✅ Done! Dashboard notifications will now arrive here.',
    telegramLinkExpired: 'The link has expired. Create a new one in the dashboard settings.',
    telegramNotLinked: 'Connect Telegram in the dashboard settings first.',
    testNotification: 'Test notification: everything works 🎉',
    achievementsTitle: '🏆 New achievements',
    rarity: { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' },
    morningDigestTitle: '☀️ Good morning',
    aiLanguage: 'English',
    askUsage: 'Write a question after the command, e.g. /ask what birthdays are this week?',
    askNotConfigured:
      'AI is not configured: add a connection in the dashboard, Settings → Integrations.',
    askDescription: 'Ask AI about your data: /ask how much did I spend in September?',
    newChatDescription: 'Start a new conversation with the assistant',
    newChatDone: '🧹 Started a new conversation.',
    assistantFailed:
      'The AI request failed. Check the connection in Settings → Integrations or switch the model: /model',
    modelDescription: 'Switch the AI model: /model 2',
    modelList: (lines: string[]) =>
      `🤖 AI connections:\n${lines.join('\n')}\n\nSwitch: /model <number>`,
    modelUsage: 'Send the number from the list: /model 2. The list: /model',
    modelSwitched: (name: string, model: string) => `✅ Now answering: ${name} (${model})`,
    telegramFileTooLarge: 'The file is larger than 20 MB — Telegram does not let bots download it.',
    telegramPhotoWhere: 'Where does this photo go?',
    telegramPhotoExpired: 'The photo is no longer waiting: send it again.',
    voiceNotConfigured:
      'To understand voice messages, add an OpenAI connection in the dashboard: Settings → Integrations ' +
      '(DeepSeek has no speech recognition).',
    voiceEmpty: '🎤 Could not hear any words — try again?',
    voiceFailed: '🎤 Speech recognition failed. Check the connection in Settings → Integrations.',
    attachmentUnsupported:
      'I can read PDF, Excel (.xlsx), CSV and text files. Photos go to the diary.',
    attachmentEmpty:
      'There is no text in this file — probably a scan. Export the statement as PDF with text or CSV.',
    attachmentFailed: 'Could not read the file. Is it damaged or password-protected?',
    systemErrorTitle: '⚠️ Dashboard error',
    systemErrorSeeSettings: 'Details: Settings → System.',
    backupTitle: '🗄️ Backups need attention',
    backupProblems: {
      missing: 'There is no database dump at all.',
      stale: 'The newest database dump is too old — the backup job may have stopped.',
      unchecked: 'No test restore for more than a week.',
      'restore-failed': 'The latest test restore of a dump failed or lost rows.',
    },
    backupCopyStale: (days: number) =>
      `The last copy of the server's backup on this computer is ${days} days old.`,
    backupSeeSettings: 'Details: Settings → Sync.',
    reconcileTitle: '⚠️ The computer and the server hold different data',
    reconcileBody: (tables: string) =>
      `Tables: ${tables}.
Settings → Sync on the computer: "Resync everything" usually fixes it.`,
  },
  ru: {
    telegramLinked: '✅ Готово! Теперь уведомления дашборда будут приходить сюда.',
    telegramLinkExpired: 'Ссылка устарела. Создай новую в настройках дашборда.',
    telegramNotLinked: 'Сначала подключи Telegram в настройках дашборда.',
    testNotification: 'Тестовое уведомление: всё работает 🎉',
    achievementsTitle: '🏆 Новые ачивки',
    rarity: { common: 'Обычная', rare: 'Редкая', epic: 'Эпическая', legendary: 'Легендарная' },
    morningDigestTitle: '☀️ Доброе утро',
    aiLanguage: 'Russian',
    askUsage: 'Напиши вопрос после команды, например: /ask какие дни рождения на этой неделе?',
    askNotConfigured: 'AI не настроен: добавь подключение в дашборде, Настройки → Интеграции.',
    askDescription: 'Вопрос AI по твоим данным: /ask сколько я потратил в сентябре?',
    newChatDescription: 'Начать новый разговор с ассистентом',
    newChatDone: '🧹 Начали новый разговор.',
    assistantFailed:
      'Запрос к AI не удался. Проверь подключение в Настройки → Интеграции или переключи модель: /model',
    modelDescription: 'Переключить модель AI: /model 2',
    modelList: (lines: string[]) =>
      `🤖 Подключения AI:\n${lines.join('\n')}\n\nПереключить: /model <номер>`,
    modelUsage: 'Отправь номер из списка: /model 2. Список: /model',
    modelSwitched: (name: string, model: string) => `✅ Теперь отвечает: ${name} (${model})`,
    telegramFileTooLarge: 'Файл больше 20 МБ — Telegram не даёт ботам скачивать такие.',
    telegramPhotoWhere: 'Куда отправить это фото?',
    telegramPhotoExpired: 'Фото уже не ждёт: пришлите его ещё раз.',
    voiceNotConfigured:
      'Чтобы понимать голосовые, добавь подключение OpenAI в дашборде: Настройки → Интеграции ' +
      '(у DeepSeek нет распознавания речи).',
    voiceEmpty: '🎤 Не расслышал ни слова — попробуешь ещё раз?',
    voiceFailed: '🎤 Не получилось распознать речь. Проверь подключение в Настройки → Интеграции.',
    attachmentUnsupported:
      'Я читаю PDF, Excel (.xlsx), CSV и текстовые файлы. Фото уходят в дневник.',
    attachmentEmpty:
      'В файле нет текста — похоже, это скан. Выгрузи выписку в PDF с текстом или в CSV.',
    attachmentFailed: 'Не получилось прочитать файл. Он не повреждён и не защищён паролем?',
    systemErrorTitle: '⚠️ Ошибка в дашборде',
    systemErrorSeeSettings: 'Подробности: Настройки → Система.',
    backupTitle: '🗄️ С бэкапами что-то не так',
    backupProblems: {
      missing: 'Нет ни одного дампа базы.',
      stale: 'Последний дамп базы слишком старый — похоже, бэкап перестал делаться.',
      unchecked: 'Больше недели не было пробного восстановления.',
      'restore-failed': 'Последнее пробное восстановление дампа не удалось или потеряло строки.',
    },
    backupCopyStale: (days: number) =>
      `Последней копии бэкапа сервера на этом компьютере уже ${days} дн.`,
    backupSeeSettings: 'Подробности: Настройки → Синхронизация.',
    reconcileTitle: '⚠️ На компьютере и на сервере разные данные',
    reconcileBody: (tables: string) =>
      `Таблицы: ${tables}.
Настройки → Синхронизация на компьютере: «Синхронизировать всё заново» обычно помогает.`,
  },
};

export function coreMessages(locale: string | null | undefined) {
  return pickMessages(messages, locale);
}
