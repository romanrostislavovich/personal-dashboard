import { WebDashboardModule } from '@pd/web-core';

/**
 * Web part of the Activity section: time at the computer, recorded by the tracker of the
 * desktop app. Plugged in at apps/web/src/app/modules.ts.
 */
export const activityModule: WebDashboardModule = {
  id: 'activity',
  nav: { labelKey: 'activity.title', icon: 'timelapse', group: 'work' },
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
          path: 'focus',
          loadComponent: () => import('./focus/focus.page').then((m) => m.FocusPage),
        },
        {
          path: 'workstates',
          loadComponent: () =>
            import('./workstates/workstate-timeline.component').then(
              (m) => m.WorkstateTimelineComponent,
            ),
        },
        {
          path: 'notifications',
          loadComponent: () =>
            import('./notifications/notifications.page').then((m) => m.NotificationsPage),
        },
        {
          path: 'places',
          loadComponent: () => import('./places/places.page').then((m) => m.PlacesPage),
        },
        {
          path: 'computers',
          loadComponent: () => import('./computers/computers.page').then((m) => m.ComputersPage),
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
      id: 'activity.workstates',
      labelKey: 'activity.workstates.title',
      icon: 'history',
      url: '/activity/workstates',
    },
    {
      id: 'activity.focus',
      labelKey: 'activity.commands.focus',
      icon: 'timer',
      url: '/activity/focus',
    },
    {
      id: 'activity.settings',
      labelKey: 'activity.commands.settings',
      icon: 'tune',
      url: '/activity/settings',
    },
  ],
  integrations: [
    {
      id: 'activity.google-places',
      loadComponent: () =>
        import('./places/google-places.integration').then((m) => m.GooglePlacesIntegration),
    },
  ],
  // The trackers of every device and the time of devices without one: Settings → Devices.
  devices: [
    {
      id: 'activity.trackers',
      loadComponent: () => import('./tracker-card.component').then((m) => m.TrackerCardComponent),
    },
    {
      id: 'activity.other-computers',
      loadComponent: () =>
        import('./settings/other-computers-settings.component').then(
          (m) => m.OtherComputersSettingsComponent,
        ),
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
