import { WebDashboardModule } from '@pd/web-core';

/** Web part of the Open Source module (GitHub + npm). Plugged in at apps/web/src/app/modules.ts. */
export const githubOssModule: WebDashboardModule = {
  id: 'github-oss',
  nav: { labelKey: 'github-oss.title', icon: 'code' },
  loadRoutes: async () => [
    { path: '', loadComponent: () => import('./github-oss.page').then((m) => m.GithubOssPage) },
  ],
  translations: {
    en: () => import('./i18n/en.json'),
    ru: () => import('./i18n/ru.json'),
  },
  widgets: [
    {
      id: 'github-oss.summary',
      size: 'medium',
      loadComponent: () => import('./github-oss.widget').then((m) => m.GithubOssWidget),
    },
  ],
};
