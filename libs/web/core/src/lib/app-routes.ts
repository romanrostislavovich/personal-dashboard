import { Routes } from '@angular/router';
import { authGuard } from './auth/auth.guard';
import { WebDashboardModule } from './dashboard-module';
import { ShellComponent } from './layout/shell.component';

/** App routes: core pages + one section per enabled module. */
export function buildAppRoutes(modules: WebDashboardModule[]): Routes {
  return [
    {
      path: 'login',
      loadComponent: () => import('./auth/login.page').then((m) => m.LoginPage),
    },
    {
      path: 'register',
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
      canActivate: [authGuard],
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
          path: 'settings',
          loadComponent: () => import('./settings/settings.page').then((m) => m.SettingsPage),
        },
        ...modules.map((module) => ({ path: module.id, loadChildren: module.loadRoutes })),
      ],
    },
    { path: '**', redirectTo: '' },
  ];
}
