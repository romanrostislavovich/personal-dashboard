import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import localeRu from '@angular/common/locales/ru';
import {
  EnvironmentProviders,
  inject,
  isDevMode,
  LOCALE_ID,
  makeEnvironmentProviders,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { MatIconRegistry } from '@angular/material/icon';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { buildAppRoutes } from './app-routes';
import { authInterceptor } from './auth/auth.interceptor';
import { AuthService } from './auth/auth.service';
import { OfflineService } from './offline/offline.service';
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
    // The installed app: pages and the data seen before are kept for offline use, a new version
    // is fetched in the background (apps/web/ngsw-config.json). Off in development.
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
    provideAppInitializer(async () => {
      const offline = inject(OfflineService);
      await inject(AuthService).restoreSession();
      offline.start();
    }),
    // <mat-icon> uses rounded Material Symbols (loaded in index.html).
    provideAppInitializer(() => {
      inject(MatIconRegistry).setDefaultFontSetClass('material-symbols-rounded');
    }),
  ]);
}
