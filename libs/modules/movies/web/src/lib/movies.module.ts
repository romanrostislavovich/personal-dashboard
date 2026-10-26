import { WebDashboardModule } from '@pd/web-core';

/**
 * Web part of Movies: what was watched (the browser extension notes it on any site that plays a
 * video), rated and noted, and the list to watch. Plugged in at apps/web/src/app/modules.ts.
 */
export const moviesModule: WebDashboardModule = {
  id: 'movies',
  nav: { labelKey: 'movies.title', icon: 'movie', group: 'leisure' },
  // The page holds the tabs; every subsection is its child route.
  loadRoutes: async () => [
    {
      path: '',
      loadComponent: () => import('./movies.page').then((m) => m.MoviesPage),
      children: [
        { path: '', pathMatch: 'full', redirectTo: 'history' },
        {
          path: 'history',
          loadComponent: () => import('./history.page').then((m) => m.HistoryPage),
        },
        { path: 'want', loadComponent: () => import('./want.page').then((m) => m.WantPage) },
        {
          path: 'unknown',
          data: { kind: 'unknown' },
          loadComponent: () => import('./views.page').then((m) => m.ViewsPage),
        },
        {
          path: 'videos',
          data: { kind: 'video' },
          loadComponent: () => import('./views.page').then((m) => m.ViewsPage),
        },
      ],
    },
  ],
  translations: {
    en: () => import('./i18n/en.json'),
    ru: () => import('./i18n/ru.json'),
  },
  commands: [
    { id: 'movies.want', labelKey: 'movies.tabs.want', icon: 'bookmark', url: '/movies/want' },
  ],
  integrations: [
    {
      id: 'movies.tmdb',
      loadComponent: () => import('./movies.integration').then((m) => m.MoviesIntegration),
    },
  ],
};
