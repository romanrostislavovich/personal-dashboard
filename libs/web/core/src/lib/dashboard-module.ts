import { InjectionToken, Injector, Provider, Type } from '@angular/core';
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
  /**
   * Side menu item. `labelKey` is a translation key, `icon` is a Material Icon name; `group` puts
   * it in a group of the menu (none — at the top level), `menu: false` keeps it out of the menu
   * (reached from its widget and the command palette).
   */
  nav: { labelKey: string; icon: string; group?: NavGroupId; menu?: false };
  /** Module pages, loaded lazily. */
  loadRoutes: () => Promise<Routes>;
  /** Module translations per language: `{ ru: () => import('./i18n/ru.json') }`. */
  translations: Record<string, () => Promise<{ default: Translation }>>;
  /** Widgets for the home page. */
  widgets?: DashboardWidget[];
  /** What the command palette (Ctrl+K) offers besides the section itself. */
  commands?: DashboardCommand[];
  /**
   * Connections to outside services (tokens, accounts, API keys). They are all shown in one
   * place — Settings → Integrations — not on the module's pages.
   */
  integrations?: DashboardIntegration[];
  /**
   * Work of the module in the background once the app has started and the session is known
   * (the sync of a folder of the desktop app): loaded then, run with the app's injector.
   */
  loadStart?: () => Promise<(injector: Injector) => void>;
}

/**
 * The groups of the side menu, in their order of the menu: a group shows where its first
 * section is. `bottom` is not a group: the sections next to Settings.
 */
export const NAV_GROUPS = ['things', 'me', 'work', 'leisure', 'safety', 'bottom'] as const;
export type NavGroupId = (typeof NAV_GROUPS)[number];

/**
 * A line of the command palette: a page inside the section (`url`), or an action on the text
 * typed into the palette (`loadAction`) — "Add a task: buy milk".
 */
export interface DashboardCommand {
  /** Unique: `<module>.<command>`. */
  id: string;
  labelKey: string;
  icon: string;
  url?: string;
  /** Loaded when first used; does its work with the text and the app's injector. */
  loadAction?: () => Promise<(text: string, injector: Injector) => Promise<void>>;
  /** The same for a picture (a screenshot captured by the desktop app). */
  loadImageAction?: () => Promise<(image: File, injector: Injector) => Promise<void>>;
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
