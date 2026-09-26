import { ApplicationConfig } from '@angular/core';
import { provideDashboard } from '@pd/web-core';
import { enabledModules } from './modules';

export const appConfig: ApplicationConfig = {
  providers: [provideDashboard(enabledModules)],
};
