import { WebDashboardModule } from '@pd/web-core';

/**
 * Web part of Health: one medical history across countries and clinics.
 * Plugged in at apps/web/src/app/modules.ts.
 */
export const healthModule: WebDashboardModule = {
  id: 'health',
  nav: { labelKey: 'health.title', icon: 'medical_information' },
  // The page holds the tabs; every subsection is its child route.
  loadRoutes: async () => [
    {
      path: '',
      loadComponent: () => import('./health.page').then((m) => m.HealthPage),
      children: [
        { path: '', pathMatch: 'full', redirectTo: 'history' },
        {
          path: 'history',
          loadComponent: () => import('./history/history.page').then((m) => m.HistoryPage),
        },
        {
          path: 'conditions',
          loadComponent: () => import('./conditions/conditions.page').then((m) => m.ConditionsPage),
        },
        {
          path: 'results',
          loadComponent: () => import('./results/results.page').then((m) => m.ResultsPage),
        },
        {
          path: 'medications',
          loadComponent: () =>
            import('./medications/medications.page').then((m) => m.MedicationsPage),
        },
        {
          path: 'doctors',
          loadComponent: () => import('./doctors/doctors.page').then((m) => m.DoctorsPage),
        },
      ],
    },
  ],
  translations: {
    en: () => import('./i18n/en.json'),
    ru: () => import('./i18n/ru.json'),
  },
  commands: [
    {
      id: 'health.conditions',
      labelKey: 'health.tabs.conditions',
      icon: 'diagnosis',
      url: '/health/conditions',
    },
    {
      id: 'health.results',
      labelKey: 'health.tabs.results',
      icon: 'labs',
      url: '/health/results',
    },
    {
      id: 'health.medications',
      labelKey: 'health.tabs.medications',
      icon: 'medication',
      url: '/health/medications',
    },
  ],
  integrations: [
    {
      id: 'health.icd',
      loadComponent: () =>
        import('./icd/icd-dictionary.integration').then((m) => m.IcdDictionaryIntegration),
    },
  ],
};
