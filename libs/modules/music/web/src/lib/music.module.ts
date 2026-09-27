import { WebDashboardModule } from '@pd/web-core';

/** Web-часть модуля «Музыка». Подключается в apps/web/src/app/modules.ts. */
export const musicModule: WebDashboardModule = {
  id: 'music',
  nav: { labelKey: 'music.title', icon: 'headphones' },
  loadRoutes: async () => [
    { path: '', loadComponent: () => import('./music.page').then((m) => m.MusicPage) },
  ],
  translations: {
    en: () => import('./i18n/en.json'),
    ru: () => import('./i18n/ru.json'),
  },
  widgets: [
    {
      id: 'music.now-playing',
      size: 'small',
      loadComponent: () => import('./music.widget').then((m) => m.MusicWidget),
    },
  ],
};
