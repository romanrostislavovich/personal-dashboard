import { WebDashboardModule } from '@pd/web-core';

/** Web part of the Games module. Plugged in at apps/web/src/app/modules.ts. */
export const gamesModule: WebDashboardModule = {
  id: 'games',
  nav: { labelKey: 'games.title', icon: 'sports_esports' },
  loadRoutes: async () => [
    { path: '', loadComponent: () => import('./games.page').then((m) => m.GamesPage) },
  ],
  translations: {
    en: () => import('./i18n/en.json'),
    ru: () => import('./i18n/ru.json'),
  },
  widgets: [
    {
      id: 'games.summary',
      size: 'small',
      loadComponent: () => import('./games.widget').then((m) => m.GamesWidget),
    },
  ],
};
