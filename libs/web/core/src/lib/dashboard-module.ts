import { InjectionToken, Provider, Type } from '@angular/core';
import { Routes } from '@angular/router';
import { Translation } from '@jsverse/transloco';

/**
 * Контракт web-части модуля дашборда. Каждый модуль (birthdays, finance, …)
 * экспортирует один такой объект, а приложение подключает его в apps/web/src/app/modules.ts.
 *
 * Пример — libs/modules/birthdays/web/src/lib/birthdays.module.ts.
 */
export interface WebDashboardModule {
  /**
   * Уникальный id: он же сегмент URL (`/birthdays`) и неймспейс переводов
   * (`'birthdays.title' | transloco`).
   */
  id: string;
  /** Пункт бокового меню. `labelKey` — ключ перевода, `icon` — имя Material Icon. */
  nav: { labelKey: string; icon: string };
  /** Страницы модуля, загружаются лениво. */
  loadRoutes: () => Promise<Routes>;
  /** Переводы модуля по языкам: `{ ru: () => import('./i18n/ru.json') }`. */
  translations: Record<string, () => Promise<{ default: Translation }>>;
  /** Виджеты для главной страницы. */
  widgets?: DashboardWidget[];
}

export interface DashboardWidget {
  id: string;
  /** Сколько колонок сетки занимает виджет. */
  size?: 'small' | 'medium' | 'large';
  loadComponent: () => Promise<Type<unknown>>;
}

export const DASHBOARD_MODULES = new InjectionToken<WebDashboardModule[]>('DASHBOARD_MODULES');

export function provideDashboardModules(modules: WebDashboardModule[]): Provider {
  return { provide: DASHBOARD_MODULES, useValue: modules };
}
