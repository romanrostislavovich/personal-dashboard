import { InjectionToken, Provider, Type } from '@angular/core';
import { Routes } from '@angular/router';
import { Translation } from '@jsverse/transloco';

/**
 * Contract of a dashboard module's web part. Each module (birthdays, finance, …)
 * exports one such object, and the app plugs it in at apps/web/src/app/modules.ts.
 *
 * Example — libs/modules/birthdays/web/src/lib/birthdays.module.ts.
 */
export interface WebDashboardModule {
  /**
   * Unique id: also the URL segment (`/birthdays`) and the translation namespace
   * (`'birthdays.title' | transloco`).
   */
  id: string;
  /** Side menu item. `labelKey` is a translation key, `icon` is a Material Icon name. */
  nav: { labelKey: string; icon: string };
  /** Module pages, loaded lazily. */
  loadRoutes: () => Promise<Routes>;
  /** Module translations per language: `{ ru: () => import('./i18n/ru.json') }`. */
  translations: Record<string, () => Promise<{ default: Translation }>>;
  /** Widgets for the home page. */
  widgets?: DashboardWidget[];
  /**
   * Connections to outside services (tokens, accounts, API keys). They are all shown in one
   * place — Settings → Integrations — not on the module's pages.
   */
  integrations?: DashboardIntegration[];
}

/** A self-contained card (or a few) that connects a module to an outside service. */
export interface DashboardIntegration {
  id: string;
  loadComponent: () => Promise<Type<unknown>>;
}

/** Where the integrations are: module pages link here when something is not connected yet. */
export const INTEGRATIONS_LINK = { path: '/settings', queryParams: { tab: 'integrations' } };

export interface DashboardWidget {
  id: string;
  /** How many grid columns the widget spans. */
  size?: 'small' | 'medium' | 'large';
  loadComponent: () => Promise<Type<unknown>>;
}

export const DASHBOARD_MODULES = new InjectionToken<WebDashboardModule[]>('DASHBOARD_MODULES');

export function provideDashboardModules(modules: WebDashboardModule[]): Provider {
  return { provide: DASHBOARD_MODULES, useValue: modules };
}
