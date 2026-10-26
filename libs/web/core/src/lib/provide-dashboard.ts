import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import localeRu from '@angular/common/locales/ru';
import {
  Injector,
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
import { isMobileApp } from './mobile/mobile-app';
import { MobileAppService } from './mobile/mobile-app.service';
import { offlineReadInterceptor } from './mobile/offline-read.interceptor';
import { serverUrlInterceptor } from './mobile/server-url.interceptor';
import { AuthService } from './auth/auth.service';
import { DeviceBackupService } from './backup/device-backup.service';
import { DesktopDeviceService } from './realtime/desktop-device.service';
import { DesktopInstallService } from './apps/desktop-install.service';
import { OfflineService } from './offline/offline.service';
import { ThemeService } from './theme/theme.service';
import { provideDashboardModules, WebDashboardModule } from './dashboard-module';
import { provideScrollableTabs, startScrollableTabs } from './ui/scrollable-tabs';
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
    provideHttpClient(
      withInterceptors([serverUrlInterceptor, offlineReadInterceptor, authInterceptor]),
    ),
    provideDashboardModules(modules),
    provideI18n(),
    // Date, number and currency formats follow the UI language (changes with a reload).
    { provide: LOCALE_ID, useFactory: initialLanguage },
    // The theme of this device is on the page before anything is drawn (and before sign-in).
    provideAppInitializer(() => {
      inject(ThemeService);
    }),
    // The installed app: pages and the data seen before are kept for offline use, a new version
    // is fetched in the background (apps/web/ngsw-config.json). Off in development, and in the
    // Android app: its interface is inside it, and a newer one comes from MobileAppService.
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode() && !isMobileApp(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
    provideAppInitializer(async () => {
      const offline = inject(OfflineService);
      const backup = inject(DeviceBackupService);
      const desktopInstall = inject(DesktopInstallService);
      const desktopDevice = inject(DesktopDeviceService);
      const mobile = inject(MobileAppService);
      const injector = inject(Injector);
      await inject(AuthService).restoreSession();
      offline.start();
      backup.start();
      desktopInstall.start();
      desktopDevice.start();
      mobile.start();
      // The modules' own background work; one that fails to load leaves the others.
      for (const module of modules) {
        void module
          .loadStart?.()
          .then((start) => start(injector))
          .catch((error: unknown) => console.error(`${module.id}: ${error}`));
      }
    }),
    // Tabs scroll by a swipe, a wheel or the arrows (ui/scrollable-tabs.ts).
    provideScrollableTabs(),
    provideAppInitializer(startScrollableTabs),
    // <mat-icon> uses rounded Material Symbols (loaded in index.html).
    provideAppInitializer(() => {
      inject(MatIconRegistry).setDefaultFontSetClass('material-symbols-rounded');
    }),
  ]);
}
