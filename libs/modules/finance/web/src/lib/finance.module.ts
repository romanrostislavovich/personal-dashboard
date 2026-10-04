import { WebDashboardModule } from '@pd/web-core';

/** Web part of the Finance module. Plugged in at apps/web/src/app/modules.ts. */
export const financeModule: WebDashboardModule = {
  id: 'finance',
  nav: { labelKey: 'finance.title', icon: 'account_balance_wallet' },
  loadRoutes: async () => [
    { path: '', loadComponent: () => import('./finance.page').then((m) => m.FinancePage) },
  ],
  translations: {
    en: () => import('./i18n/en.json'),
    ru: () => import('./i18n/ru.json'),
  },
  widgets: [
    {
      id: 'finance.summary',
      size: 'medium',
      loadComponent: () => import('./finance-summary.widget').then((m) => m.FinanceSummaryWidget),
    },
    {
      id: 'finance.wishlist',
      size: 'medium',
      loadComponent: () => import('./wishlist/wishlist.widget').then((m) => m.WishlistWidget),
    },
  ],
  integrations: [
    {
      id: 'finance.cost-sources',
      loadComponent: () =>
        import('./cost-sources.integration').then((m) => m.CostSourcesIntegration),
    },
  ],
};
