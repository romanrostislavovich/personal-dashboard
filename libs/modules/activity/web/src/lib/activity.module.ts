import { WebDashboardModule } from '@pd/web-core';

/**
 * Web part of the Activity section: time at the computer, recorded by the tracker of the
 * desktop app. Plugged in at apps/web/src/app/modules.ts.
 */
export const activityModule: WebDashboardModule = {
  id: 'activity',
  nav: { labelKey: 'activity.title', icon: 'timelapse' },
  // The page holds the tabs; every subsection is its child route.
  loadRoutes: async () => [
    {
      path: '',
      loadComponent: () => import('./activity.page').then((m) => m.ActivityPage),
      children: [
        { path: '', pathMatch: 'full', redirectTo: 'overview' },
        {
          path: 'overview',
          loadComponent: () => import('./overview/overview.page').then((m) => m.OverviewPage),
        },
        {
          path: 'settings',
          loadComponent: () => import('./settings/settings.page').then((m) => m.SettingsPage),
        },
      ],
    },
  ],
  translations: {
    en: () => import('./i18n/en.json'),
    ru: () => import('./i18n/ru.json'),
  },
  commands: [
    {
      id: 'activity.settings',
      labelKey: 'activity.commands.settings',
      icon: 'tune',
      url: '/activity/settings',
    },
  ],
  widgets: [
    {
      id: 'activity.today',
      size: 'small',
      loadComponent: () => import('./activity.widget').then((m) => m.ActivityWidget),
    },
  ],
};
