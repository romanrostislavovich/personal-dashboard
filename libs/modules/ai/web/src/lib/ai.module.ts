import { WebDashboardModule } from '@pd/web-core';

/**
 * Web part of the AI. The backend is in the core (AiService); modules give the model
 * access to their data through their `*.ai-tools.ts`.
 */
export const aiModule: WebDashboardModule = {
  id: 'ai',
  nav: { labelKey: 'ai.title', icon: 'auto_awesome' },
  loadRoutes: async () => [
    { path: '', loadComponent: () => import('./ai.page').then((m) => m.AiPage) },
  ],
  translations: {
    en: () => import('./i18n/en.json'),
    ru: () => import('./i18n/ru.json'),
  },
  widgets: [
    {
      id: 'ai.ask',
      size: 'small',
      loadComponent: () => import('./ai.widget').then((m) => m.AiWidget),
    },
  ],
  integrations: [
    {
      id: 'ai.connections',
      loadComponent: () => import('./ai.integration').then((m) => m.AiIntegration),
    },
  ],
};
