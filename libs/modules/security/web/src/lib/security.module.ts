import { WebDashboardModule } from '@pd/web-core';

/**
 * Web part of the security agent: its findings and the AI's report. The server side is the core
 * (`/api/security`): the rules check every hour, the AI investigates once a day and on request.
 */
export const securityModule: WebDashboardModule = {
  id: 'security',
  nav: { labelKey: 'security.title', icon: 'shield' },
  loadRoutes: async () => [
    { path: '', loadComponent: () => import('./security.page').then((m) => m.SecurityPage) },
  ],
  translations: {
    en: () => import('./i18n/en.json'),
    ru: () => import('./i18n/ru.json'),
  },
};
