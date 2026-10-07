import { CODE_PROVIDERS } from '@pd/contracts';
import { WebDashboardModule } from '@pd/web-core';

/**
 * Web part of the Development section: repositories, open source and private (GitHub, GitLab,
 * Bitbucket and npm), the accounts on these services — each on its own and all together — and coding time
 * from WakaTime.
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
        { path: '', pathMatch: 'full', redirectTo: 'repositories' },
        // The tab was "Open Source" once: old links and bookmarks still open it.
        { path: 'open-source', pathMatch: 'full', redirectTo: 'repositories' },
        {
          path: 'summary',
          loadComponent: () => import('./accounts/summary.page').then((m) => m.SummaryPage),
        },
        {
          path: 'repositories',
          loadComponent: () =>
            import('./open-source/open-source.page').then((m) => m.OpenSourcePage),
        },
        // One page for every service: which one comes with the route.
        ...CODE_PROVIDERS.map((provider) => ({
          path: provider,
          data: { provider },
          loadComponent: () => import('./accounts/account.page').then((m) => m.AccountPage),
        })),
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
  commands: [
    {
      id: 'development.summary',
      labelKey: 'development.tabs.summary',
      icon: 'insights',
      url: '/development/summary',
    },
    {
      id: 'development.github',
      labelKey: 'development.tabs.github',
      icon: 'code',
      url: '/development/github',
    },
    {
      id: 'development.gitlab',
      labelKey: 'development.tabs.gitlab',
      icon: 'code',
      url: '/development/gitlab',
    },
    {
      id: 'development.bitbucket',
      labelKey: 'development.tabs.bitbucket',
      icon: 'code',
      url: '/development/bitbucket',
    },
    {
      id: 'development.wakatime',
      labelKey: 'development.tabs.wakatime',
      icon: 'timer',
      url: '/development/wakatime',
    },
  ],
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
      id: 'development.gitlab-token',
      loadComponent: () =>
        import('./accounts/gitlab-token.integration').then((m) => m.GitlabTokenIntegration),
    },
    {
      id: 'development.bitbucket-token',
      loadComponent: () =>
        import('./accounts/bitbucket-token.integration').then((m) => m.BitbucketTokenIntegration),
    },
    {
      id: 'development.wakatime-key',
      loadComponent: () =>
        import('./wakatime/wakatime.integration').then((m) => m.WakatimeIntegration),
    },
  ],
};
