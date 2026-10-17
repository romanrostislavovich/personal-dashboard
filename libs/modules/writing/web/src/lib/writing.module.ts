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
  integrations: [
    {
      id: 'writing.language-tool',
      loadComponent: () => import('./writing.integration').then((m) => m.WritingIntegration),
    },
  ],
  // In the desktop app: the fields of every program are checked too.
  loadStart: async () => {
    const { DesktopWritingService } = await import('./desktop-writing.service');
    return (injector) => injector.get(DesktopWritingService).start();
  },
};
