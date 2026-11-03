import {pickMessages} from '@pd/api-core';

/** The VPN's notifications and the security agent's texts; the language is `user.locale`. */
const messages = {
  en: {
    downTitle: '🔴 The VPN is down',
    downBody:
      'The VPN container has not answered for 3 minutes: devices cannot connect. On the server: docker compose logs vpn',
    upTitle: '🟢 The VPN is back',
    upBody: 'Devices can connect again.',
    firstTitle: (name: string) => `🔐 ${name} is in the VPN`,
    firstBody: (address: string) =>
      `The device connected for the first time, from ${address}. Its traffic now goes through your server.`,
    networkTitle: (name: string) => `🌍 ${name}: the VPN from a new network`,
    networkBody: (network: string, address: string) =>
      `It connected from ${address} (${network}), a network it never came from in 90 days. ` +
      'If it was not you, delete the device in the VPN section: its key stops working within a minute.',
    finding: {
      newNetworkTitle: (name: string) => `VPN: ${name} came from a new network`,
      newNetworkDetails: (network: string, address: string) =>
        `${address} (${network}) in the last 24 hours, never seen in 90 days before.`,
      newNetworkFix:
        'If it was not you (a new SIM, a trip, a café), delete the device in VPN and add it again.',
      downTitle: 'VPN: the container does not answer',
      downDetails: (minutes: number) =>
        `No status for ${minutes} minutes while devices are set up.`,
      downFix:
        'On the server: docker compose logs vpn; to start it again: docker compose up -d vpn.',
      idleTitle: (name: string) => `VPN: ${name} unused for 60 days`,
      idleDetails: 'Its key still opens the VPN.',
      idleFix: 'Delete the device if it is gone or not used.',
    },
  },
  ru: {
    downTitle: '🔴 VPN не работает',
    downBody:
      'Контейнер VPN не отвечает 3 минуты: устройства не подключатся. На сервере: docker compose logs vpn',
    upTitle: '🟢 VPN снова работает',
    upBody: 'Устройства снова могут подключаться.',
    firstTitle: (name: string) => `🔐 ${name} в VPN`,
    firstBody: (address: string) =>
      `Устройство подключилось впервые, с ${address}. Его трафик теперь идёт через твой сервер.`,
    networkTitle: (name: string) => `🌍 ${name}: VPN из новой сети`,
    networkBody: (network: string, address: string) =>
      `Подключение с ${address} (${network}) — из этой сети устройство не заходило 90 дней. ` +
      'Если это не ты, удали устройство в разделе VPN: его ключ перестанет работать в течение минуты.',
    finding: {
      newNetworkTitle: (name: string) => `VPN: ${name} зашёл из новой сети`,
      newNetworkDetails: (network: string, address: string) =>
        `${address} (${network}) за последние 24 часа; раньше за 90 дней такой сети не было.`,
      newNetworkFix:
        'Если это не ты (новая SIM-карта, поездка, кафе), удали устройство в VPN и добавь заново.',
      downTitle: 'VPN: контейнер не отвечает',
      downDetails: (minutes: number) =>
        `Нет статуса ${minutes} мин., хотя устройства настроены.`,
      downFix:
        'На сервере: docker compose logs vpn; запустить снова: docker compose up -d vpn.',
      idleTitle: (name: string) => `VPN: ${name} не использовался 60 дней`,
      idleDetails: 'Его ключ всё ещё открывает VPN.',
      idleFix: 'Удали устройство, если его больше нет или оно не нужно.',
    },
  },
};

export const vpnMessages = (locale: string) => pickMessages(messages, locale);
