import { WebDashboardModule } from '@pd/web-core';

/**
 * Web-часть AI. Бэкенд — в ядре (AiService); доступ к данным модели дают
 * сами модули через свои `*.ai-tools.ts`.
 */
export const aiModule: WebDashboardModule = {
  id: 'ai',
  nav: { labelKey: 'ai.title', icon: 'auto_awesome' },
  loadRoutes: async () => [
    { path: '', loadComponent: () => import('./ai.page').then((m) => m.AiPage) },
  ],
  translations: {
    ru: () => import('./i18n/ru.json'),
  },
  widgets: [
    {
      id: 'ai.ask',
      size: 'small',
      loadComponent: () => import('./ai.widget').then((m) => m.AiWidget),
    },
  ],
};
