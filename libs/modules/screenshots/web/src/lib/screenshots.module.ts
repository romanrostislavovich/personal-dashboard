import {WebDashboardModule} from '@pd/web-core';

/**
 * Web part of Screenshots: the pieces of the screen the desktop app took, and the sync of its
 * folder with the server (started with the app, in the desktop app only). Plugged in at
 * apps/web/src/app/modules.ts.
 */
export const screenshotsModule: WebDashboardModule = {
  id: 'screenshots',
  nav: {
    labelKey: 'screenshots.title',
    icon: 'screenshot_region',
    group: 'things',
  },
  loadRoutes: async () => [
    {
      path: '',
      loadComponent: () =>
        import('./screenshots.page').then(m => m.ScreenshotsPage),
    },
  ],
  translations: {
    en: () => import('./i18n/en.json'),
    ru: () => import('./i18n/ru.json'),
  },
  loadStart: async () => {
    const {ScreenshotSyncService} = await import('./screenshot-sync.service');
    return injector => injector.get(ScreenshotSyncService).start();
  },
};
