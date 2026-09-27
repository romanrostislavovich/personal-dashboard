import { WebDashboardModule } from '@pd/web-core';

/** Web-часть модуля «Дневник». Подключается в apps/web/src/app/modules.ts. */
export const diaryModule: WebDashboardModule = {
  id: 'diary',
  nav: { labelKey: 'diary.title', icon: 'menu_book' },
  loadRoutes: async () => [
    { path: '', loadComponent: () => import('./diary.page').then((m) => m.DiaryPage) },
  ],
  translations: {
    en: () => import('./i18n/en.json'),
    ru: () => import('./i18n/ru.json'),
  },
  widgets: [
    {
      id: 'diary.today',
      size: 'small',
      loadComponent: () => import('./diary.widget').then((m) => m.DiaryWidget),
    },
  ],
};
