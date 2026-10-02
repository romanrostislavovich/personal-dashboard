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
import { MatIconRegistry } from '@angular/material/icon';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { buildAppRoutes } from './app-routes';
import { authInterceptor } from './auth/auth.interceptor';
import { AuthService } from './auth/auth.service';
import { ThemeService } from './theme/theme.service';
import { provideDashboardModules, WebDashboardModule } from './dashboard-module';
import { provideI18n } from './i18n/i18n';
import { initialLanguage } from './i18n/language';

registerLocaleData(localeRu);

/**
 * Everything the dashboard app needs, in one call:
 * `bootstrapApplication(App, { providers: [provideDashboard(enabledModules)] })`.
 */
export function provideDashboard(modules: WebDashboardModule[]): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideBrowserGlobalErrorListeners(),
    provideRouter(buildAppRoutes(modules), withComponentInputBinding()),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideDashboardModules(modules),
    provideI18n(),
    // Date, number and currency formats follow the UI language (changes with a reload).
    { provide: LOCALE_ID, useFactory: initialLanguage },
    // The theme of this device is on the page before anything is drawn (and before sign-in).
    provideAppInitializer(() => {
      inject(ThemeService);
    }),
    provideAppInitializer(() => inject(AuthService).restoreSession()),
    // <mat-icon> uses rounded Material Symbols (loaded in index.html).
    provideAppInitializer(() => {
      inject(MatIconRegistry).setDefaultFontSetClass('material-symbols-rounded');
    }),
  ]);
}
