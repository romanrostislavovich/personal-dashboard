import { WebDashboardModule } from '@pd/web-core';

/**
 * Web part of the Development section: open source repositories (GitHub + npm), the GitHub
 * account and coding time from WakaTime.
 * Plugged in at apps/web/src/app/modules.ts.
 */
export const developmentModule: WebDashboardModule = {
  id: 'development',
  nav: { labelKey: 'development.title', icon: 'code' },
  // The page holds the tabs; every subsection is its child route.
  loadRoutes: async () => [
    {
      path: '',
      loadComponent: () => import('./development.page').then((m) => m.DevelopmentPage),
      children: [
        { path: '', pathMatch: 'full', redirectTo: 'open-source' },
        {
          path: 'open-source',
          loadComponent: () =>
            import('./open-source/open-source.page').then((m) => m.OpenSourcePage),
        },
        {
          path: 'github',
          loadComponent: () =>
            import('./github/github-profile.page').then((m) => m.GithubProfilePage),
        },
        {
          path: 'wakatime',
          loadComponent: () => import('./wakatime/wakatime.page').then((m) => m.WakatimePage),
        },
      ],
    },
  ],
  translations: {
    en: () => import('./i18n/en.json'),
    ru: () => import('./i18n/ru.json'),
  },
  widgets: [
    {
      id: 'development.summary',
      size: 'small',
      loadComponent: () => import('./development.widget').then((m) => m.DevelopmentWidget),
    },
    {
      id: 'development.open-source',
      size: 'medium',
      loadComponent: () =>
        import('./open-source/open-source.widget').then((m) => m.OpenSourceWidget),
    },
  ],
  integrations: [
    {
      id: 'development.github-token',
      loadComponent: () =>
        import('./github/github-token.integration').then((m) => m.GithubTokenIntegration),
    },
    {
      id: 'development.wakatime-key',
      loadComponent: () =>
        import('./wakatime/wakatime.integration').then((m) => m.WakatimeIntegration),
    },
  ],
};
