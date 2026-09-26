import { WebDashboardModule } from '@pd/web-core';

/** Web-часть модуля «Мониторинг». Подключается в apps/web/src/app/modules.ts. */
export const monitoringModule: WebDashboardModule = {
  id: 'monitoring',
  nav: { labelKey: 'monitoring.title', icon: 'monitor_heart' },
  loadRoutes: async () => [
    { path: '', loadComponent: () => import('./monitoring.page').then((m) => m.MonitoringPage) },
  ],
  translations: {
    ru: () => import('./i18n/ru.json'),
  },
  widgets: [
    {
      id: 'monitoring.status',
      size: 'small',
      loadComponent: () => import('./monitoring.widget').then((m) => m.MonitoringWidget),
    },
  ],
};
