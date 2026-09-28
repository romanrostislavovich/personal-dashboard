import { WebDashboardModule } from '@pd/web-core';

/** Web part of the Weather module. Plugged in at apps/web/src/app/modules.ts. */
export const weatherModule: WebDashboardModule = {
  id: 'weather',
  nav: { labelKey: 'weather.title', icon: 'partly_cloudy_day' },
  loadRoutes: async () => [
    { path: '', loadComponent: () => import('./weather.page').then((m) => m.WeatherPage) },
  ],
  translations: {
    en: () => import('./i18n/en.json'),
    ru: () => import('./i18n/ru.json'),
  },
  widgets: [
    {
      id: 'weather.today',
      size: 'small',
      loadComponent: () => import('./weather.widget').then((m) => m.WeatherWidget),
    },
  ],
};
