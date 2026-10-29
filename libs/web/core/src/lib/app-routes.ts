import { Routes } from '@angular/router';
import { authGuard } from './auth/auth.guard';
import { WebDashboardModule } from './dashboard-module';
import { ShellComponent } from './layout/shell.component';
import { serverGuard } from './mobile/server.guard';

/** App routes: core pages + one section per enabled module. */
export function buildAppRoutes(modules: WebDashboardModule[]): Routes {
  return [
    {
      // The Android app: which server to talk to (mobile/mobile-app.ts).
      path: 'connect',
      loadComponent: () => import('./mobile/connect.page').then((m) => m.ConnectPage),
    },
    {
      path: 'login',
      canActivate: [serverGuard],
      loadComponent: () => import('./auth/login.page').then((m) => m.LoginPage),
    },
    {
      path: 'register',
      canActivate: [serverGuard],
      loadComponent: () => import('./auth/register.page').then((m) => m.RegisterPage),
    },
    {
      // A small window of the desktop app: what a shortcut captured, without the menu.
      path: 'capture',
      canActivate: [authGuard],
      loadComponent: () => import('./capture/capture.page').then((m) => m.CapturePage),
    },
    {
      path: '',
      component: ShellComponent,
      canActivate: [serverGuard, authGuard],
      children: [
        {
          path: '',
          pathMatch: 'full',
          loadComponent: () => import('./dashboard/dashboard.page').then((m) => m.DashboardPage),
        },
        {
          path: 'projects',
          loadComponent: () => import('./projects/projects.page').then((m) => m.ProjectsPage),
        },
        {
          path: 'projects/:id',
          loadComponent: () => import('./projects/project.page').then((m) => m.ProjectPage),
        },
        {
          // The bell: every notification, and one's card with its buttons.
          path: 'notifications',
          loadComponent: () =>
            import('./inbox/notifications.page').then((m) => m.NotificationsPage),
        },
        {
          path: 'notifications/:id',
          loadComponent: () => import('./inbox/notification.page').then((m) => m.NotificationPage),
        },
        {
          path: 'settings',
          loadComponent: () => import('./settings/settings.page').then((m) => m.SettingsPage),
        },
        ...modules.map((module) => ({ path: module.id, loadChildren: module.loadRoutes })),
      ],
    },
    { path: '**', redirectTo: '' },
  ];
}
