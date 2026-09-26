import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import localeRu from '@angular/common/locales/ru';
import {
  EnvironmentProviders,
  inject,
  LOCALE_ID,
  makeEnvironmentProviders,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { buildAppRoutes } from './app-routes';
import { authInterceptor } from './auth/auth.interceptor';
import { AuthService } from './auth/auth.service';
import { provideDashboardModules, WebDashboardModule } from './dashboard-module';
import { provideI18n } from './i18n/i18n';

registerLocaleData(localeRu);

/**
 * Всё, что нужно приложению дашборда, одним вызовом:
 * `bootstrapApplication(App, { providers: [provideDashboard(enabledModules)] })`.
 */
export function provideDashboard(modules: WebDashboardModule[]): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideBrowserGlobalErrorListeners(),
    provideRouter(buildAppRoutes(modules), withComponentInputBinding()),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideDashboardModules(modules),
    provideI18n(),
    // Формат дат/чисел/валют. Когда появится выбор языка, это станет динамическим.
    { provide: LOCALE_ID, useValue: 'ru' },
    provideAppInitializer(() => inject(AuthService).restoreSession()),
  ]);
}
