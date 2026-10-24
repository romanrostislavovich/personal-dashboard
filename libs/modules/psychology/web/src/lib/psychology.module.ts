import { WebDashboardModule } from '@pd/web-core';

/**
 * Web part of Psychology: the patterns of the mood, short questionnaires over time and the
 * events of a life, a gentle day for hard days and briefs for an appointment.
 * Plugged in at apps/web/src/app/modules.ts.
 */
export const psychologyModule: WebDashboardModule = {
  id: 'psychology',
  nav: { labelKey: 'psychology.title', icon: 'psychology', group: 'me' },
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
          path: 'checkups',
          loadComponent: () => import('./checkups.page').then((m) => m.CheckupsPage),
        },
        { path: 'events', loadComponent: () => import('./events.page').then((m) => m.EventsPage) },
        {
          path: 'gentle',
          loadComponent: () => import('./gentle/gentle.page').then((m) => m.GentlePage),
        },
        {
          path: 'briefs',
          loadComponent: () => import('./brief/briefs.page').then((m) => m.BriefsPage),
        },
        { path: 'help', loadComponent: () => import('./help/help.page').then((m) => m.HelpPage) },
      ],
    },
  ],
  translations: {
    en: () => import('./i18n/en.json'),
    ru: () => import('./i18n/ru.json'),
  },
  widgets: [
    {
      id: 'psychology.gentle-day',
      size: 'small',
      loadComponent: () => import('./gentle/gentle-day.widget').then((m) => m.GentleDayWidget),
    },
  ],
  commands: [
    {
      id: 'psychology.help',
      labelKey: 'psychology.tabs.help',
      icon: 'support',
      url: '/psychology/help',
    },
    {
      id: 'psychology.gentle',
      labelKey: 'psychology.tabs.gentle',
      icon: 'spa',
      url: '/psychology/gentle',
    },
    {
      id: 'psychology.briefs',
      labelKey: 'psychology.tabs.briefs',
      icon: 'assignment',
      url: '/psychology/briefs',
    },
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
