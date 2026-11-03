import {WebDashboardModule} from '@pd/web-core';

/** Web part of the VPN module. Plugged in at apps/web/src/app/modules.ts. */
export const vpnModule: WebDashboardModule = {
  id: 'vpn',
  nav: {labelKey: 'vpn.title', icon: 'vpn_lock', group: 'safety'},
  loadRoutes: async () => [
    {
      path: '',
      loadComponent: () => import('./vpn.page').then(m => m.VpnPage),
    },
  ],
  translations: {
    en: () => import('./i18n/en.json'),
    ru: () => import('./i18n/ru.json'),
  },
  widgets: [
    {
      id: 'vpn.status',
      size: 'small',
      loadComponent: () => import('./vpn.widget').then(m => m.VpnWidget),
    },
  ],
};
