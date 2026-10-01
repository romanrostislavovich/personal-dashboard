import { WebDashboardModule } from '@pd/web-core';

/**
 * Web part of the Development section: open source repositories (GitHub + npm).
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
      ],
    },
  ],
  translations: {
    en: () => import('./i18n/en.json'),
    ru: () => import('./i18n/ru.json'),
  },
  widgets: [
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
  ],
};
