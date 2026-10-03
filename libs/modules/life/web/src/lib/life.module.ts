import { WebDashboardModule } from '@pd/web-core';

/**
 * Web part of the Life section: a day across every module, the summaries of a month or a year
 * with the AI's story, goals of a year and questions about one's own life. The server side is
 * the core (`/api/life`): each module tells it what it can.
 */
export const lifeModule: WebDashboardModule = {
  id: 'life',
  nav: { labelKey: 'life.title', icon: 'auto_stories' },
  loadRoutes: async () => [
    {
      path: '',
      loadComponent: () => import('./life.page').then((m) => m.LifePage),
      children: [
        { path: '', pathMatch: 'full', redirectTo: 'day' },
        { path: 'day', loadComponent: () => import('./day.page').then((m) => m.DayPage) },
        {
          path: 'summary',
          loadComponent: () => import('./summary.page').then((m) => m.SummaryPage),
        },
        { path: 'goals', loadComponent: () => import('./goals.page').then((m) => m.GoalsPage) },
        { path: 'ask', loadComponent: () => import('./ask.page').then((m) => m.AskPage) },
      ],
    },
  ],
  translations: {
    en: () => import('./i18n/en.json'),
    ru: () => import('./i18n/ru.json'),
  },
  commands: [
    { id: 'life.summary', labelKey: 'life.tabs.summary', icon: 'redeem', url: '/life/summary' },
    { id: 'life.goals', labelKey: 'life.tabs.goals', icon: 'flag', url: '/life/goals' },
    { id: 'life.ask', labelKey: 'life.ask.command', icon: 'manage_search', url: '/life/ask' },
  ],
};
