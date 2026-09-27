import { WebDashboardModule } from '@pd/web-core';

/**
 * Web-часть ачивок. Бэкенд — в ядре (AchievementsService), а сами ачивки
 * описывает каждый модуль в своём `*.achievements.ts`.
 */
export const achievementsModule: WebDashboardModule = {
  id: 'achievements',
  nav: { labelKey: 'achievements.title', icon: 'emoji_events' },
  loadRoutes: async () => [
    {
      path: '',
      loadComponent: () => import('./achievements.page').then((m) => m.AchievementsPage),
    },
  ],
  translations: {
    en: () => import('./i18n/en.json'),
    ru: () => import('./i18n/ru.json'),
  },
  widgets: [
    {
      id: 'achievements.summary',
      size: 'small',
      loadComponent: () => import('./achievements.widget').then((m) => m.AchievementsWidget),
    },
  ],
};
