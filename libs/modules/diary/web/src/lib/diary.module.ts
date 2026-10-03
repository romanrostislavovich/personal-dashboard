import { WebDashboardModule } from '@pd/web-core';

/** Web part of the Diary module. Plugged in at apps/web/src/app/modules.ts. */
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
  commands: [
    {
      id: 'diary.append',
      labelKey: 'diary.commands.append',
      icon: 'edit_note',
      loadAction: () => import('./diary.commands').then((m) => m.appendToDiary),
    },
    {
      id: 'diary.photo',
      labelKey: 'diary.commands.photo',
      icon: 'add_photo_alternate',
      loadImageAction: () => import('./diary.commands').then((m) => m.photoToDiary),
    },
  ],
  widgets: [
    {
      id: 'diary.today',
      size: 'small',
      loadComponent: () => import('./diary.widget').then((m) => m.DiaryWidget),
    },
  ],
};
