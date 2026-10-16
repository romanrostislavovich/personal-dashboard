import { WebDashboardModule } from '@pd/web-core';

/**
 * Web part of Writing: a text checked as it is typed, the AI's rewrites, and the settings the
 * browser extension and the desktop app follow. Plugged in at apps/web/src/app/modules.ts.
 */
export const writingModule: WebDashboardModule = {
  id: 'writing',
  nav: { labelKey: 'writing.title', icon: 'spellcheck', group: 'work' },
  loadRoutes: async () => [
    { path: '', loadComponent: () => import('./writing.page').then((m) => m.WritingPage) },
  ],
  translations: {
    en: () => import('./i18n/en.json'),
    ru: () => import('./i18n/ru.json'),
  },
};
