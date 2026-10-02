import { WebDashboardModule } from '@pd/web-core';

/** Web part of the Music module. Plugged in at apps/web/src/app/modules.ts. */
export const musicModule: WebDashboardModule = {
  id: 'music',
  nav: { labelKey: 'music.title', icon: 'headphones' },
  // The page holds the tabs; every subsection is its child route.
  loadRoutes: async () => [
    {
      path: '',
      loadComponent: () => import('./music.page').then((m) => m.MusicPage),
      children: [
        { path: '', pathMatch: 'full', redirectTo: 'listening' },
        {
          path: 'listening',
          loadComponent: () => import('./listening.page').then((m) => m.ListeningPage),
        },
        {
          path: 'soundcloud',
          loadComponent: () => import('./soundcloud/soundcloud.page').then((m) => m.SoundcloudPage),
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
      id: 'music.soundcloud',
      labelKey: 'music.tabs.soundcloud',
      icon: 'cloud',
      url: '/music/soundcloud',
    },
  ],
  widgets: [
    {
      id: 'music.now-playing',
      size: 'small',
      loadComponent: () => import('./music.widget').then((m) => m.MusicWidget),
    },
    {
      id: 'music.soundcloud',
      size: 'small',
      loadComponent: () => import('./soundcloud/soundcloud.widget').then((m) => m.SoundcloudWidget),
    },
  ],
  integrations: [
    {
      id: 'music.sources',
      loadComponent: () => import('./music.integration').then((m) => m.MusicIntegration),
    },
    {
      id: 'music.soundcloud',
      loadComponent: () =>
        import('./soundcloud/soundcloud.integration').then((m) => m.SoundcloudIntegration),
    },
  ],
};
