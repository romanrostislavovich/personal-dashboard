import { pickMessages } from '@pd/api-core';

/** Texts of the security agent's findings about a computer; the language is `user.locale`. */
const messages = {
  en: {
    silent: (name: string, days: number) => ({
      title: `${name}: no report for ${days} days`,
      details: 'The desktop app has not told anything about this computer: its state is unknown.',
      fix: 'Start the app on that computer, or remove the computer in Activity → Setup if it is gone.',
    }),
    antivirusOff: (name: string) => ({
      title: `${name}: the antivirus is off`,
      details: 'Microsoft Defender (or its real-time protection) is switched off.',
      fix: 'Windows Security → Virus & threat protection → turn real-time protection on. If another antivirus is installed, ignore this finding.',
    }),
    signaturesOld: (name: string, days: number) => ({
      title: `${name}: antivirus definitions are ${days} days old`,
      details: 'New threats are not recognized until the definitions are updated.',
      fix: 'Windows Security → Virus & threat protection → Protection updates → Check for updates.',
    }),
    firewallOff: (name: string, profiles: string[]) => ({
      title: `${name}: the Windows firewall is off`,
      details: `Switched off for the networks: ${profiles.join(', ')}.`,
      fix: 'Windows Security → Firewall & network protection → turn it on for every network.',
    }),
    notEncrypted: (name: string) => ({
      title: `${name}: the system disk is not encrypted`,
      details:
        'Whoever gets the computer or its disk reads everything on it, the dashboard session included.',
      fix: 'Settings → Privacy & security → Device encryption (or BitLocker) → turn on, and keep the recovery key.',
    }),
    updatesOld: (name: string, days: number) => ({
      title: `${name}: no Windows update for ${days} days`,
      details: 'Security fixes come every month; this computer has missed some.',
      fix: 'Settings → Windows Update → Check for updates.',
    }),
    restartPending: (name: string) => ({
      title: `${name}: an update waits for a restart`,
      details: 'Installed fixes take effect only after the computer restarts.',
      fix: 'Restart the computer.',
    }),
    noIdleLock: (name: string) => ({
      title: `${name}: the screen does not lock by itself`,
      details:
        'No locking screen saver and no inactivity limit are set. A lock on sleep is not visible to the app, so this may be fine.',
      fix: 'Settings → Accounts → Sign-in options → require sign-in when away, and lock with Win+L when leaving.',
    }),
    uacOff: (name: string) => ({
      title: `${name}: User Account Control is off`,
      details: 'Any program gets administrator rights without asking.',
      fix: 'Control Panel → User Accounts → Change User Account Control settings → the default level.',
    }),
  },
  ru: {
    silent: (name: string, days: number) => ({
      title: `${name}: нет данных уже ${days} дн.`,
      details:
        'Десктопное приложение ничего не сообщает об этом компьютере: его состояние неизвестно.',
      fix: 'Запустите приложение на этом компьютере или удалите компьютер в «Активность → Настройка», если его больше нет.',
    }),
    antivirusOff: (name: string) => ({
      title: `${name}: антивирус выключен`,
      details: 'Microsoft Defender (или его защита в реальном времени) отключён.',
      fix: 'Безопасность Windows → Защита от вирусов и угроз → включите защиту в реальном времени. Если стоит другой антивирус, отметьте находку как «знаю».',
    }),
    signaturesOld: (name: string, days: number) => ({
      title: `${name}: базам антивируса ${days} дн.`,
      details: 'Новые угрозы не распознаются, пока базы не обновятся.',
      fix: 'Безопасность Windows → Защита от вирусов и угроз → Обновления защиты → Проверить наличие обновлений.',
    }),
    firewallOff: (name: string, profiles: string[]) => ({
      title: `${name}: брандмауэр Windows выключен`,
      details: `Отключён для сетей: ${profiles.join(', ')}.`,
      fix: 'Безопасность Windows → Брандмауэр и безопасность сети → включите для всех сетей.',
    }),
    notEncrypted: (name: string) => ({
      title: `${name}: системный диск не зашифрован`,
      details: 'Тот, кому попадёт компьютер или его диск, прочитает всё, включая сессию дашборда.',
      fix: 'Параметры → Конфиденциальность и защита → Шифрование устройства (или BitLocker) → включите и сохраните ключ восстановления.',
    }),
    updatesOld: (name: string, days: number) => ({
      title: `${name}: обновлений Windows не было ${days} дн.`,
      details: 'Исправления безопасности выходят каждый месяц; этот компьютер часть пропустил.',
      fix: 'Параметры → Центр обновления Windows → Проверить наличие обновлений.',
    }),
    restartPending: (name: string) => ({
      title: `${name}: обновление ждёт перезагрузки`,
      details: 'Установленные исправления начнут работать только после перезапуска.',
      fix: 'Перезагрузите компьютер.',
    }),
    noIdleLock: (name: string) => ({
      title: `${name}: экран не блокируется сам`,
      details:
        'Не настроены ни заставка с блокировкой, ни лимит бездействия. Блокировку при уходе в сон приложение не видит, так что это может быть нормой.',
      fix: 'Параметры → Учётные записи → Варианты входа → требовать вход при отсутствии, и блокируйте Win+L, уходя.',
    }),
    uacOff: (name: string) => ({
      title: `${name}: контроль учётных записей выключен`,
      details: 'Любая программа получает права администратора без вопроса.',
      fix: 'Панель управления → Учётные записи → Изменение параметров контроля учётных записей → уровень по умолчанию.',
    }),
  },
};

export type ComputerSecurityMessages = (typeof messages)['en'];

export function computerSecurityMessages(locale: string): ComputerSecurityMessages {
  return pickMessages(messages, locale);
}
