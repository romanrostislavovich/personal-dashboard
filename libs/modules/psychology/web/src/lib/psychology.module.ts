import { WebDashboardModule } from '@pd/web-core';

/**
 * Web part of Psychology: the patterns of the mood, a few questions about the week, notes
 * about oneself, short questionnaires over time and the events of a life.
 * Plugged in at apps/web/src/app/modules.ts.
 */
export const psychologyModule: WebDashboardModule = {
  id: 'psychology',
  nav: { labelKey: 'psychology.title', icon: 'psychology' },
  // The page holds the tabs; every subsection is its child route.
  loadRoutes: async () => [
    {
      path: '',
      loadComponent: () => import('./psychology.page').then((m) => m.PsychologyPage),
      children: [
        { path: '', pathMatch: 'full', redirectTo: 'patterns' },
        {
          path: 'patterns',
          loadComponent: () => import('./patterns.page').then((m) => m.PatternsPage),
        },
        {
          path: 'reflection',
          loadComponent: () => import('./reflection.page').then((m) => m.ReflectionPage),
        },
        { path: 'notes', loadComponent: () => import('./notes.page').then((m) => m.NotesPage) },
        {
          path: 'checkups',
          loadComponent: () => import('./checkups.page').then((m) => m.CheckupsPage),
        },
        { path: 'events', loadComponent: () => import('./events.page').then((m) => m.EventsPage) },
      ],
    },
  ],
  translations: {
    en: () => import('./i18n/en.json'),
    ru: () => import('./i18n/ru.json'),
  },
  commands: [
    {
      id: 'psychology.events',
      labelKey: 'psychology.tabs.events',
      icon: 'event_note',
      url: '/psychology/events',
    },
    {
      id: 'psychology.checkups',
      labelKey: 'psychology.tabs.checkups',
      icon: 'fact_check',
      url: '/psychology/checkups',
    },
  ],
};
