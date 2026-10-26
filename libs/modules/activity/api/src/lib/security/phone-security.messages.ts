import { pickMessages } from '@pd/api-core';

const list = (apps: string[]) => apps.join(', ');

/** Texts of the security agent's findings about a phone; the language is `user.locale`. */
const messages = {
  en: {
    silent: (name: string, days: number) => ({
      title: `${name}: no security report for ${days} days`,
      details: 'The Android app has not told anything about the phone: its state is unknown.',
      fix: 'Open the dashboard app on the phone; if it is gone, remove the phone in Settings → Devices.',
    }),
    oldPatch: (name: string, patch: string, release: string) => ({
      title: `${name}: no security updates since ${patch}`,
      details: `Android ${release}, security patch of ${patch}: holes found since then stay open on this phone, and its maker sends no more updates.`,
      fix: 'Nothing can be installed: the way out is a newer phone. Until then keep apps from Google Play only and the screen locked. Ignore this finding once you know it.',
    }),
    noLock: (name: string) => ({
      title: `${name}: the screen is not locked`,
      details:
        'No PIN, pattern, password or fingerprint: whoever holds the phone reads everything on it.',
      fix: 'Settings → Passwords & security (Lock screen) → set a PIN or a password, then a fingerprint.',
    }),
    notEncrypted: (name: string) => ({
      title: `${name}: the storage is not encrypted`,
      details: 'The data can be read from the memory without unlocking the phone.',
      fix: 'Set a screen lock (it turns encryption on); on older phones: Settings → Security → Encrypt phone.',
    }),
    rooted: (name: string) => ({
      title: `${name}: the phone is rooted`,
      details: "An app with root rights can read and change everything, the other apps' data too.",
      fix: 'If you did not root it yourself, back up and reset the phone. If you did, ignore this finding.',
    }),
    deviceAdmins: (name: string, apps: string[]) => ({
      title: `${name}: ${apps.length === 1 ? 'an app is' : `${apps.length} apps are`} device administrator`,
      details: `${list(apps)} may lock or wipe the phone and change its passwords, and is hard to remove.`,
      fix: 'Settings → Passwords & security → Privacy → Device admin apps: switch off what you do not know (a work profile or "Find my device" are normal).',
    }),
    userCertificates: (name: string, count: number) => ({
      title: `${name}: ${count === 1 ? 'a certificate' : `${count} certificates`} added by hand`,
      details:
        'A certificate authority added to the phone lets whoever owns it read its HTTPS traffic — banks and passwords too.',
      fix: 'Settings → Passwords & security → Privacy → Encryption & credentials → User credentials: remove what you did not add yourself (a company VPN or a debugging proxy may need one).',
    }),
    installers: (name: string, apps: string[]) => ({
      title: `${name}: ${apps.length === 1 ? 'an app may' : `${apps.length} apps may`} install other apps`,
      details: `${list(apps)} may install apps from outside Google Play: an APK from a chat or a site is the usual way malware gets in.`,
      fix: 'Settings → Apps → Special app access → Install unknown apps: switch it off for every app that does not need it.',
    }),
    openWifi: (name: string, wifi: string) => ({
      title: `${name}: on an open Wi-Fi (${wifi})`,
      details:
        'A network without a password: others on it may see what the phone sends unencrypted.',
      fix: 'Use mobile data or a VPN there; forget the network if it is not needed.',
    }),
  },
  ru: {
    silent: (name: string, days: number) => ({
      title: `${name}: нет отчёта о безопасности ${days} дн.`,
      details: 'Приложение на Android ничего не сообщало о телефоне: его состояние неизвестно.',
      fix: 'Откройте приложение дашборда на телефоне; если телефона больше нет — удалите его в «Настройки → Устройства».',
    }),
    oldPatch: (name: string, patch: string, release: string) => ({
      title: `${name}: нет обновлений безопасности с ${patch}`,
      details: `Android ${release}, патч безопасности от ${patch}: найденные с тех пор дыры на этом телефоне остаются открытыми, а производитель больше не выпускает обновлений.`,
      fix: 'Установить нечего: выход — более новый телефон. До тех пор ставьте приложения только из Google Play и держите экран заблокированным. Когда это знаете — отметьте находку «игнорировать».',
    }),
    noLock: (name: string) => ({
      title: `${name}: экран не блокируется`,
      details:
        'Ни PIN-кода, ни графического ключа, ни пароля, ни отпечатка: кто держит телефон, тот читает всё на нём.',
      fix: 'Настройки → Пароли и безопасность (Экран блокировки) → задайте PIN или пароль, затем отпечаток.',
    }),
    notEncrypted: (name: string) => ({
      title: `${name}: память не зашифрована`,
      details: 'Данные можно прочитать из памяти, не разблокируя телефон.',
      fix: 'Задайте блокировку экрана (она включает шифрование); на старых телефонах: Настройки → Безопасность → Зашифровать телефон.',
    }),
    rooted: (name: string) => ({
      title: `${name}: на телефоне root`,
      details:
        'Приложение с правами root читает и меняет всё, в том числе данные других приложений.',
      fix: 'Если root ставили не вы — сохраните данные и сбросьте телефон. Если вы — отметьте находку «игнорировать».',
    }),
    deviceAdmins: (name: string, apps: string[]) => ({
      title: `${name}: ${apps.length === 1 ? 'приложение — администратор' : `${apps.length} приложения — администраторы`} устройства`,
      details: `${list(apps)} может блокировать и стирать телефон, менять его пароли, и его трудно удалить.`,
      fix: 'Настройки → Пароли и безопасность → Конфиденциальность → Приложения администратора устройства: выключите незнакомые (рабочий профиль и «Найти устройство» — это нормально).',
    }),
    userCertificates: (name: string, count: number) => ({
      title: `${name}: ${count === 1 ? 'сертификат добавлен' : `${count} сертификата добавлены`} вручную`,
      details:
        'Добавленный на телефон центр сертификации позволяет его владельцу читать HTTPS-трафик телефона — и банки, и пароли.',
      fix: 'Настройки → Пароли и безопасность → Конфиденциальность → Шифрование и учётные данные → Пользовательские сертификаты: удалите то, что добавляли не вы (корпоративному VPN или отладочному прокси он может быть нужен).',
    }),
    installers: (name: string, apps: string[]) => ({
      title: `${name}: ${apps.length === 1 ? 'приложению разрешено' : `${apps.length} приложениям разрешено`} ставить другие приложения`,
      details: `${list(apps)} может ставить приложения не из Google Play: APK из чата или с сайта — обычный путь вредоносных программ.`,
      fix: 'Настройки → Приложения → Особый доступ → Установка неизвестных приложений: выключите для всех, кому это не нужно.',
    }),
    openWifi: (name: string, wifi: string) => ({
      title: `${name}: открытый Wi-Fi (${wifi})`,
      details:
        'Сеть без пароля: другие в ней могут видеть то, что телефон отправляет без шифрования.',
      fix: 'Там используйте мобильный интернет или VPN; забудьте сеть, если она не нужна.',
    }),
  },
};

export type PhoneSecurityMessages = (typeof messages)['en'];

export function phoneSecurityMessages(locale: string): PhoneSecurityMessages {
  return pickMessages(messages, locale);
}
