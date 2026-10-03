import { DiskAction, DiskKnownPlace, DiskReport, DiskSafety, DiskSuggestion } from '@pd/contracts';

const MB = 1024 ** 2;

type Text = { en: string; ru: string };

/** What to do with a known place: the default advice, and what the AI starts from. */
const PLACES: Record<
  DiskKnownPlace,
  { action: DiskAction; safety: DiskSafety; reason: Text; how?: Text }
> = {
  temp: {
    action: 'trash',
    safety: 'safe',
    reason: {
      en: 'Temporary files of programs; what is in use stays.',
      ru: 'Временные файлы программ; то, что сейчас используется, останется.',
    },
  },
  'browser-cache': {
    action: 'trash',
    safety: 'safe',
    reason: {
      en: 'Browser cache: pages load it again. Close the browser first.',
      ru: 'Кэш браузера: страницы загрузят его заново. Сначала закройте браузер.',
    },
  },
  'spotify-cache': {
    action: 'trash',
    safety: 'check',
    reason: {
      en: 'Spotify cache, with the songs saved for offline listening: they are downloaded again when played. Close Spotify first; its settings can also cap the cache size.',
      ru: 'Кэш Spotify вместе с песнями, сохранёнными для офлайна: при прослушивании они скачаются заново. Сначала закройте Spotify; в его настройках можно ограничить размер кэша.',
    },
  },
  'npm-cache': {
    action: 'command',
    safety: 'safe',
    reason: {
      en: 'npm downloads packages again when needed.',
      ru: 'npm скачает пакеты заново, когда понадобятся.',
    },
    how: { en: 'npm cache clean --force', ru: 'npm cache clean --force' },
  },
  'yarn-cache': {
    action: 'command',
    safety: 'safe',
    reason: {
      en: 'Yarn downloads packages again when needed.',
      ru: 'Yarn скачает пакеты заново, когда понадобятся.',
    },
    how: { en: 'yarn cache clean', ru: 'yarn cache clean' },
  },
  'pip-cache': {
    action: 'command',
    safety: 'safe',
    reason: {
      en: 'pip downloads packages again when needed.',
      ru: 'pip скачает пакеты заново, когда понадобятся.',
    },
    how: { en: 'pip cache purge', ru: 'pip cache purge' },
  },
  'nuget-cache': {
    action: 'command',
    safety: 'safe',
    reason: {
      en: 'NuGet restores packages again on the next build.',
      ru: 'NuGet восстановит пакеты при следующей сборке.',
    },
    how: { en: 'dotnet nuget locals all --clear', ru: 'dotnet nuget locals all --clear' },
  },
  'gradle-cache': {
    action: 'trash',
    safety: 'check',
    reason: {
      en: 'Gradle downloads dependencies again; the next build is slower.',
      ru: 'Gradle скачает зависимости заново; следующая сборка будет дольше.',
    },
  },
  'maven-repository': {
    action: 'trash',
    safety: 'check',
    reason: {
      en: 'Maven downloads dependencies again; the next build is slower.',
      ru: 'Maven скачает зависимости заново; следующая сборка будет дольше.',
    },
  },
  'jetbrains-caches': {
    action: 'review',
    safety: 'check',
    reason: {
      en: 'Caches and logs of JetBrains IDEs; folders of old versions can go.',
      ru: 'Кэши и логи IDE JetBrains; папки старых версий можно удалить.',
    },
  },
  'crash-dumps': {
    action: 'trash',
    safety: 'safe',
    reason: {
      en: 'Memory dumps of programs that crashed: needed only to report a crash.',
      ru: 'Дампы памяти упавших программ: нужны только для отчёта об ошибке.',
    },
  },
  'docker-data': {
    action: 'command',
    safety: 'check',
    reason: {
      en: 'Docker keeps images, containers and volumes in a virtual disk; unused ones can be removed, then the disk compacted.',
      ru: 'Docker хранит образы, контейнеры и тома в виртуальном диске; неиспользуемые можно удалить, а диск — сжать.',
    },
    how: {
      en: 'docker system prune -a (keeps volumes; add --volumes to remove them too)',
      ru: 'docker system prune -a (тома остаются; с --volumes удалятся и они)',
    },
  },
  'wsl-disk': {
    action: 'tool',
    safety: 'check',
    reason: {
      en: 'The virtual disk of a WSL Linux grows and never shrinks by itself.',
      ru: 'Виртуальный диск Linux в WSL растёт и сам не уменьшается.',
    },
    how: {
      en: 'wsl --shutdown, then: wsl --manage <distro> --set-sparse true',
      ru: 'wsl --shutdown, затем: wsl --manage <дистрибутив> --set-sparse true',
    },
  },
  'windows-old': {
    action: 'tool',
    safety: 'check',
    reason: {
      en: 'The previous Windows, kept for a rollback after an upgrade.',
      ru: 'Предыдущая Windows, хранится для отката после обновления.',
    },
    how: {
      en: 'Settings → System → Storage → Temporary files → Previous Windows installation',
      ru: 'Параметры → Система → Память → Временные файлы → Предыдущие установки Windows',
    },
  },
  'windows-update-cache': {
    action: 'tool',
    safety: 'safe',
    reason: {
      en: 'Downloaded Windows updates, already installed.',
      ru: 'Скачанные обновления Windows, уже установленные.',
    },
    how: {
      en: 'Settings → System → Storage → Temporary files → Windows Update Cleanup',
      ru: 'Параметры → Система → Память → Временные файлы → Очистка обновлений Windows',
    },
  },
  'recycle-bin': {
    action: 'tool',
    safety: 'check',
    reason: {
      en: 'Deleted files still take the space until the Recycle Bin is emptied.',
      ru: 'Удалённые файлы занимают место, пока корзину не очистить.',
    },
    how: { en: 'Recycle Bin → Empty Recycle Bin', ru: 'Корзина → Очистить корзину' },
  },
  downloads: {
    action: 'review',
    safety: 'risky',
    reason: {
      en: 'Downloads: installers and archives are usually not needed after use, but only you know.',
      ru: 'Загрузки: установщики и архивы после использования обычно не нужны, но решать вам.',
    },
  },
};

/** The advice without the AI: the known places worth more than a little. */
export function ruleAdvice(report: DiskReport, locale: string | null = 'en'): DiskSuggestion[] {
  const lang: keyof Text = locale === 'ru' ? 'ru' : 'en';
  return report.known
    .filter((place) => place.bytes >= 200 * MB)
    .map((place) => {
      const rule = PLACES[place.place];
      return {
        path: place.path,
        bytes: place.bytes,
        action: rule.action,
        safety: rule.safety,
        reason: rule.reason[lang],
        how: rule.how?.[lang] ?? null,
      };
    })
    .sort((a, b) => b.bytes - a.bytes);
}

/**
 * Paths nothing should be moved to the Recycle Bin from — the desktop app refuses them anyway,
 * this keeps the advice honest: the system, programs, virtual disks, the top folders of a user.
 */
export function mustNotTrash(path: string): boolean {
  const p = path.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
  if (/^[a-z]:$/.test(p) || /\.(sys|vhdx?|avhdx)$/.test(p)) {
    return true;
  }
  const protectedRoots = [
    /^[a-z]:\\windows(\\|$)/,
    /^[a-z]:\\program files( \(x86\))?(\\|$)/,
    /^[a-z]:\\programdata(\\|$)/,
    /^[a-z]:\\\$recycle\.bin(\\|$)/,
    /^[a-z]:\\system volume information(\\|$)/,
    /^%userprofile%\\appdata\\local\\(docker|packages|wsl)(\\|$)/,
  ];
  const exact = [
    /^%userprofile%$/,
    /^%userprofile%\\appdata(\\(local|roaming|locallow))?$/,
    /^%userprofile%\\(desktop|documents|downloads|pictures|music|videos|onedrive)$/,
    /^[a-z]:\\[^\\]+\.[a-z0-9]+$/, // A file right in the root of a disk.
  ];
  return protectedRoots.some((rule) => rule.test(p)) || exact.some((rule) => rule.test(p));
}

/** Every path of the report: advice about anything else is dropped. */
export function reportPaths(report: DiskReport): Map<string, number> {
  return new Map(
    [...report.folders, ...report.files, ...report.known].map((item) => [item.path, item.bytes]),
  );
}
