import { WebDashboardModule } from '@pd/web-core';

/** Web-часть модуля «Финансы». Подключается в apps/web/src/app/modules.ts. */
export const financeModule: WebDashboardModule = {
  id: 'finance',
  nav: { labelKey: 'finance.title', icon: 'account_balance_wallet' },
  loadRoutes: async () => [
    { path: '', loadComponent: () => import('./finance.page').then((m) => m.FinancePage) },
  ],
  translations: {
    ru: () => import('./i18n/ru.json'),
  },
  widgets: [
    {
      id: 'finance.summary',
      size: 'medium',
      loadComponent: () => import('./finance-summary.widget').then((m) => m.FinanceSummaryWidget),
    },
  ],
};
