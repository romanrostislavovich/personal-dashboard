import { WebDashboardModule } from '@pd/web-core';

/**
 * Web part of the Tasks section: the TODO list and reminders.
 * Plugged in at apps/web/src/app/modules.ts.
 */
export const tasksModule: WebDashboardModule = {
  id: 'tasks',
  nav: { labelKey: 'tasks.title', icon: 'task_alt' },
  // The page holds the tabs; every subsection is its child route.
  loadRoutes: async () => [
    {
      path: '',
      loadComponent: () => import('./tasks.page').then((m) => m.TasksPage),
      children: [
        { path: '', pathMatch: 'full', redirectTo: 'todo' },
        { path: 'todo', loadComponent: () => import('./todo/todo.page').then((m) => m.TodoPage) },
        {
          path: 'reminders',
          loadComponent: () => import('./reminders/reminders.page').then((m) => m.RemindersPage),
        },
      ],
    },
  ],
  translations: {
    en: () => import('./i18n/en.json'),
    ru: () => import('./i18n/ru.json'),
  },
  widgets: [
    {
      id: 'tasks.today',
      size: 'small',
      loadComponent: () => import('./tasks.widget').then((m) => m.TasksWidget),
    },
  ],
};
