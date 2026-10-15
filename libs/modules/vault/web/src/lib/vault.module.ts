import { WebDashboardModule } from '@pd/web-core';

/**
 * Web part of the password vault: logins and secure notes, encrypted and decrypted on this
 * device only (see VaultSession). Plugged in at apps/web/src/app/modules.ts.
 */
export const vaultModule: WebDashboardModule = {
  id: 'vault',
  nav: { labelKey: 'vault.title', icon: 'key', group: 'safety' },
  loadRoutes: async () => [
    { path: '', loadComponent: () => import('./vault.page').then((m) => m.VaultPage) },
  ],
  translations: {
    en: () => import('./i18n/en.json'),
    ru: () => import('./i18n/ru.json'),
  },
};
