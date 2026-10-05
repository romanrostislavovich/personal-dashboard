import { pickMessages } from '../i18n/locale';

/** The words of a finding: what it is, what was seen, what to do. */
export interface FindingText {
  title: string;
  details: string;
  fix: string;
}

const list = (items: string[]) => items.join(', ');

/** Texts of the security agent: the findings of the core's rules and its notifications. */
const messages = {
  en: {
    notifyTitle: (count: number) =>
      count === 1 ? '🛡 Security: a new finding' : `🛡 Security: ${count} new findings`,
    notifyLine: (severity: string, title: string) => `• [${severity}] ${title}`,
    notifyMore: 'Details and what to do — in the Security section.',

    twoFactorOff: (): FindingText => ({
      title: 'Two-factor sign-in is off',
      details: 'The account that runs this dashboard is protected by the password alone.',
      fix: 'Turn it on in Settings → Account → Security and keep the recovery codes.',
    }),
    registrationOpen: (users: number): FindingText => ({
      title: 'Anyone can register',
      details: `ALLOW_REGISTRATION is on; the dashboard has ${users} account(s).`,
      fix: 'Set ALLOW_REGISTRATION=false in the server’s .env once everybody you expect has an account.',
    }),
    signInGuessed: (attempts: string[]): FindingText => ({
      title: 'A sign-in succeeded right after failed attempts',
      details: `Someone got in after several wrong passwords from the same address: ${list(attempts)}.`,
      fix: 'If it was not you: change the password, sign out all devices (Settings → Account) and turn on two-factor sign-in.',
    }),
    signInFailures: (failed: number, top: string[]): FindingText => ({
      title: `${failed} failed sign-ins in a day`,
      details: `Most of them from: ${list(top)}.`,
      fix: 'The dashboard already locks an address after 10 attempts. A long password and two-factor sign-in make guessing pointless; an address that keeps trying can be blocked in the server’s firewall.',
    }),
    newAddress: (addresses: string[]): FindingText => ({
      title: 'A sign-in from a new address',
      details: `Signed in this week from where nobody had signed in before: ${list(addresses)}.`,
      fix: 'Nothing to do if it was you (a new network, a trip). Otherwise change the password and sign out the other devices.',
    }),
    sessionsIdle: (count: number): FindingText => ({
      title: `${count} device(s) signed in and not used for a month`,
      details: 'A forgotten session is a way in for whoever gets that device.',
      fix: 'Sign them out in Settings → Account → Devices.',
    }),
    noHttps: (url: string): FindingText => ({
      title: 'The dashboard is served without HTTPS',
      details: `PUBLIC_URL is ${url}: passwords and data travel in the open.`,
      fix: 'Put the dashboard behind HTTPS (deploy/Caddyfile does it by itself) and set PUBLIC_URL to the https:// address.',
    }),
    siteUnreachable: (url: string, error: string): FindingText => ({
      title: 'The dashboard’s own address does not answer',
      details: `${url}: ${error}.`,
      fix: 'Check the DNS record, the proxy (Caddy) and ports 80/443 of the server.',
    }),
    certificateExpiring: (days: number): FindingText => ({
      title:
        days < 0
          ? 'The HTTPS certificate has expired'
          : `The HTTPS certificate expires in ${days} day(s)`,
      details: 'Caddy renews certificates by itself a month ahead: it has not managed to.',
      fix: 'Look at `docker compose logs caddy` on the server: usually the DNS record or port 80 is the cause.',
    }),
    headersMissing: (headers: string[]): FindingText => ({
      title: 'The site lacks security headers',
      details: `Not sent: ${list(headers)}.`,
      fix: 'Add them to the proxy (the `header` block of deploy/Caddyfile) and deploy.',
    }),
    backupsOff: (): FindingText => ({
      title: 'Backups are not watched',
      details: 'BACKUP_DIR is not set: the dashboard does not know whether the database is dumped.',
      fix: 'Run the backup job of deploy/compose.yml (docs/deploy.md, "Backups").',
    }),
    backupsBroken: (problems: string[]): FindingText => ({
      title: 'Backups are not in order',
      details: `Problems: ${list(problems)}.`,
      fix: 'See Settings → Data → Sync and backups, and `docker compose logs backup` on the server.',
    }),
    dependencies: (counts: string, builtOn: string): FindingText => ({
      title: 'Known vulnerabilities in the dependencies',
      details: `npm audit of the build of ${builtOn}: ${counts}.`,
      fix: 'Run `npm audit` in the repository, update the packages it names (or pin them in `overrides`) and deploy.',
    }),

    hostStale: (hours: number): FindingText => ({
      title: 'The server’s report is old',
      details: `The scan of the server last ran ${hours} hours ago; it should run every hour.`,
      fix: 'Check /etc/cron.d/dashboard-security on the server (deploy.sh installs it) and run `sh /opt/dashboard/security-scan.sh` by hand to see the error.',
    }),
    sshPassword: (): FindingText => ({
      title: 'SSH lets in by password',
      details: 'PasswordAuthentication is on: the server’s password can be guessed from anywhere.',
      fix: 'Sign in with a key, then set `PasswordAuthentication no` in /etc/ssh/sshd_config and run `systemctl reload ssh`.',
    }),
    sshRoot: (): FindingText => ({
      title: 'root may sign in over SSH with a password',
      details: 'PermitRootLogin is `yes`.',
      fix: 'Set `PermitRootLogin prohibit-password` (a key only) in /etc/ssh/sshd_config and run `systemctl reload ssh`.',
    }),
    firewallOff: (): FindingText => ({
      title: 'The server has no firewall',
      details:
        'Neither ufw nor nftables/iptables has rules: every listening port is open to the internet.',
      fix: '`ufw allow OpenSSH && ufw allow 80,443/tcp && ufw allow 443/udp && ufw enable` — or the firewall of the hosting (Hetzner Cloud Firewall).',
    }),
    openPorts: (ports: string[]): FindingText => ({
      title: 'Ports open to the internet besides SSH and the site',
      details: `Listening on a public address: ${list(ports)}.`,
      fix: 'Stop what is not needed, bind the rest to 127.0.0.1, or close the ports in the firewall.',
    }),
    sshFailures: (failed: number): FindingText => ({
      title: `${failed} failed SSH sign-ins in a day, nothing bans them`,
      details: 'Bots guess passwords all the time; fail2ban is not running.',
      fix: '`apt install fail2ban` — it bans an address after a few attempts. With password sign-in off this is only noise.',
    }),
    updatesPending: (security: number, all: number): FindingText => ({
      title: `${security} security update(s) are waiting on the server`,
      details: `${all} package(s) can be upgraded in total.`,
      fix: '`apt update && apt upgrade` on the server; `apt install unattended-upgrades` installs security updates by itself.',
    }),
    rebootRequired: (): FindingText => ({
      title: 'The server waits for a reboot',
      details: 'An installed update (usually the kernel) takes effect only after a restart.',
      fix: 'Restart the server at a quiet moment: `reboot`. The dashboard comes back by itself.',
    }),
    updatesManual: (): FindingText => ({
      title: 'Security updates are not installed automatically',
      details: 'unattended-upgrades is not enabled on the server.',
      fix: '`apt install unattended-upgrades && dpkg-reconfigure -plow unattended-upgrades`.',
    }),
    hostDisk: (percent: number): FindingText => ({
      title: `The server’s disk is ${percent}% full`,
      details: 'A full disk stops the database and the backups.',
      fix: '`docker system prune`, old dumps in /opt/dashboard/backups, `journalctl --vacuum-size=200M` — or a larger disk.',
    }),
  },
  ru: {
    notifyTitle: (count: number) =>
      count === 1 ? '🛡 Безопасность: новая находка' : `🛡 Безопасность: новых находок — ${count}`,
    notifyLine: (severity: string, title: string) => `• [${severity}] ${title}`,
    notifyMore: 'Подробности и что делать — в разделе «Безопасность».',

    twoFactorOff: (): FindingText => ({
      title: 'Двухфакторный вход выключен',
      details: 'Аккаунт, который управляет этим дашбордом, защищён только паролем.',
      fix: 'Включите его в Настройках → Аккаунт → Безопасность и сохраните коды восстановления.',
    }),
    registrationOpen: (users: number): FindingText => ({
      title: 'Зарегистрироваться может кто угодно',
      details: `ALLOW_REGISTRATION включён; аккаунтов в дашборде: ${users}.`,
      fix: 'Поставьте ALLOW_REGISTRATION=false в .env сервера, когда все нужные люди зарегистрировались.',
    }),
    signInGuessed: (attempts: string[]): FindingText => ({
      title: 'Вход удался сразу после неудачных попыток',
      details: `Кто-то вошёл после нескольких неверных паролей с того же адреса: ${list(attempts)}.`,
      fix: 'Если это были не вы: смените пароль, выйдите на всех устройствах (Настройки → Аккаунт) и включите двухфакторный вход.',
    }),
    signInFailures: (failed: number, top: string[]): FindingText => ({
      title: `Неудачных входов за сутки: ${failed}`,
      details: `Больше всего с адресов: ${list(top)}.`,
      fix: 'Дашборд и так блокирует адрес после 10 попыток. Длинный пароль и двухфакторный вход делают подбор бессмысленным; упорный адрес можно закрыть в файрволе сервера.',
    }),
    newAddress: (addresses: string[]): FindingText => ({
      title: 'Вход с нового адреса',
      details: `На этой неделе вошли оттуда, откуда раньше не входили: ${list(addresses)}.`,
      fix: 'Если это вы (новая сеть, поездка) — ничего делать не нужно. Иначе смените пароль и выйдите на остальных устройствах.',
    }),
    sessionsIdle: (count: number): FindingText => ({
      title: `Устройств с открытым входом, которыми месяц не пользовались: ${count}`,
      details: 'Забытая сессия — вход для того, кому попадёт это устройство.',
      fix: 'Завершите их в Настройках → Аккаунт → Устройства.',
    }),
    noHttps: (url: string): FindingText => ({
      title: 'Дашборд работает без HTTPS',
      details: `PUBLIC_URL — ${url}: пароли и данные идут в открытом виде.`,
      fix: 'Поставьте дашборд за HTTPS (deploy/Caddyfile делает это сам) и укажите в PUBLIC_URL адрес с https://.',
    }),
    siteUnreachable: (url: string, error: string): FindingText => ({
      title: 'Собственный адрес дашборда не отвечает',
      details: `${url}: ${error}.`,
      fix: 'Проверьте DNS-запись, прокси (Caddy) и порты 80/443 сервера.',
    }),
    certificateExpiring: (days: number): FindingText => ({
      title: days < 0 ? 'HTTPS-сертификат истёк' : `HTTPS-сертификат истекает через ${days} дн.`,
      details: 'Caddy продлевает сертификаты сам за месяц до срока: у него не получилось.',
      fix: 'Посмотрите `docker compose logs caddy` на сервере: обычно дело в DNS-записи или порте 80.',
    }),
    headersMissing: (headers: string[]): FindingText => ({
      title: 'Сайт не отдаёт заголовки безопасности',
      details: `Не отправляются: ${list(headers)}.`,
      fix: 'Добавьте их в прокси (блок `header` в deploy/Caddyfile) и задеплойте.',
    }),
    backupsOff: (): FindingText => ({
      title: 'За бэкапами никто не следит',
      details: 'BACKUP_DIR не задан: дашборд не знает, делаются ли дампы базы.',
      fix: 'Запустите задачу бэкапа из deploy/compose.yml (docs/deploy.md, «Backups»).',
    }),
    backupsBroken: (problems: string[]): FindingText => ({
      title: 'С бэкапами не всё в порядке',
      details: `Проблемы: ${list(problems)}.`,
      fix: 'Смотрите Настройки → Данные → Синхронизация и бэкапы и `docker compose logs backup` на сервере.',
    }),
    dependencies: (counts: string, builtOn: string): FindingText => ({
      title: 'В зависимостях есть известные уязвимости',
      details: `npm audit сборки от ${builtOn}: ${counts}.`,
      fix: 'Запустите `npm audit` в репозитории, обновите названные пакеты (или закрепите версии в `overrides`) и задеплойте.',
    }),

    hostStale: (hours: number): FindingText => ({
      title: 'Отчёт сервера устарел',
      details: `Проверка сервера последний раз запускалась ${hours} ч назад, а должна — каждый час.`,
      fix: 'Проверьте /etc/cron.d/dashboard-security на сервере (его ставит deploy.sh) и запустите `sh /opt/dashboard/security-scan.sh` вручную, чтобы увидеть ошибку.',
    }),
    sshPassword: (): FindingText => ({
      title: 'SSH пускает по паролю',
      details: 'PasswordAuthentication включён: пароль сервера можно подбирать откуда угодно.',
      fix: 'Войдите по ключу, затем поставьте `PasswordAuthentication no` в /etc/ssh/sshd_config и выполните `systemctl reload ssh`.',
    }),
    sshRoot: (): FindingText => ({
      title: 'root может войти по SSH с паролем',
      details: 'PermitRootLogin — `yes`.',
      fix: 'Поставьте `PermitRootLogin prohibit-password` (только ключ) в /etc/ssh/sshd_config и выполните `systemctl reload ssh`.',
    }),
    firewallOff: (): FindingText => ({
      title: 'На сервере нет файрвола',
      details:
        'Правил нет ни в ufw, ни в nftables/iptables: каждый слушающий порт открыт в интернет.',
      fix: '`ufw allow OpenSSH && ufw allow 80,443/tcp && ufw allow 443/udp && ufw enable` — или файрвол хостинга (Hetzner Cloud Firewall).',
    }),
    openPorts: (ports: string[]): FindingText => ({
      title: 'В интернет открыты порты помимо SSH и сайта',
      details: `Слушают на публичном адресе: ${list(ports)}.`,
      fix: 'Остановите ненужное, остальное привяжите к 127.0.0.1 или закройте порты файрволом.',
    }),
    sshFailures: (failed: number): FindingText => ({
      title: `Неудачных входов по SSH за сутки: ${failed}, и их никто не банит`,
      details: 'Боты подбирают пароли постоянно; fail2ban не запущен.',
      fix: '`apt install fail2ban` — он банит адрес после нескольких попыток. Если вход по паролю выключен, это просто шум.',
    }),
    updatesPending: (security: number, all: number): FindingText => ({
      title: `На сервере ждут обновления безопасности: ${security}`,
      details: `Всего можно обновить пакетов: ${all}.`,
      fix: '`apt update && apt upgrade` на сервере; `apt install unattended-upgrades` ставит обновления безопасности сам.',
    }),
    rebootRequired: (): FindingText => ({
      title: 'Сервер ждёт перезагрузки',
      details: 'Установленное обновление (обычно ядро) начнёт работать только после перезапуска.',
      fix: 'Перезагрузите сервер в спокойный момент: `reboot`. Дашборд поднимется сам.',
    }),
    updatesManual: (): FindingText => ({
      title: 'Обновления безопасности не ставятся автоматически',
      details: 'unattended-upgrades на сервере не включён.',
      fix: '`apt install unattended-upgrades && dpkg-reconfigure -plow unattended-upgrades`.',
    }),
    hostDisk: (percent: number): FindingText => ({
      title: `Диск сервера заполнен на ${percent}%`,
      details: 'Полный диск останавливает базу и бэкапы.',
      fix: '`docker system prune`, старые дампы в /opt/dashboard/backups, `journalctl --vacuum-size=200M` — или диск побольше.',
    }),
  },
};

export type SecurityMessages = (typeof messages)['en'];

export function securityMessages(locale: string): SecurityMessages {
  return pickMessages(messages, locale);
}
