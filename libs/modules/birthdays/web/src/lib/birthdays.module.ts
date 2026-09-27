import { WebDashboardModule } from '@pd/web-core';

/** Web part of the Birthdays module. Plugged in at apps/web/src/app/modules.ts. */
export const birthdaysModule: WebDashboardModule = {
  id: 'birthdays',
  nav: { labelKey: 'birthdays.title', icon: 'cake' },
  loadRoutes: async () => [
    { path: '', loadComponent: () => import('./birthdays.page').then((m) => m.BirthdaysPage) },
  ],
  translations: {
    en: () => import('./i18n/en.json'),
    ru: () => import('./i18n/ru.json'),
  },
  widgets: [
    {
      id: 'birthdays.upcoming',
      size: 'small',
      loadComponent: () =>
        import('./upcoming-birthdays.widget').then((m) => m.UpcomingBirthdaysWidget),
    },
  ],
};
