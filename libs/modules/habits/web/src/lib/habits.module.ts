import { WebDashboardModule } from '@pd/web-core';

/**
 * Web part of Habits: what one quits or cuts down, with the run of clean days. Plugged in at
 * apps/web/src/app/modules.ts.
 */
export const habitsModule: WebDashboardModule = {
  id: 'habits',
  nav: { labelKey: 'habits.title', icon: 'spa' },
  loadRoutes: async () => [
    { path: '', loadComponent: () => import('./habits.page').then((m) => m.HabitsPage) },
  ],
  translations: {
    en: () => import('./i18n/en.json'),
    ru: () => import('./i18n/ru.json'),
  },
  widgets: [
    {
      id: 'habits.streaks',
      size: 'small',
      loadComponent: () => import('./habits.widget').then((m) => m.HabitsWidget),
    },
  ],
};
