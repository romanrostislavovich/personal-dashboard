import { httpResource } from '@angular/common/http';
import { inject, Injectable, Signal } from '@angular/core';
import { DEVELOPMENT_READS, developmentApi } from '@pd/client-core';
import { WakatimePeriod, WakatimeSettings, WakatimeStats } from '@pd/contracts';
import { DASHBOARD_CLIENT, fromCore } from '@pd/web-core';

/** The WakaTime requests of the client core (`@pd/client-core`) for Angular. */
@Injectable({ providedIn: 'root' })
export class WakatimeApi {
  private readonly development = developmentApi(inject(DASHBOARD_CLIENT).api);

  settings() {
    return httpResource<WakatimeSettings>(() => DEVELOPMENT_READS.wakatimeSettings());
  }

  /** Coding time of the chosen period; reloads when the period changes. */
  stats(period: Signal<WakatimePeriod>) {
    return httpResource<WakatimeStats>(() => DEVELOPMENT_READS.wakatimeStats(period()));
  }

  connect(apiKey: string) {
    return fromCore(() => this.development.connectWakatime(apiKey));
  }

  disconnect() {
    return fromCore(() => this.development.disconnectWakatime());
  }

  sync() {
    return fromCore(() => this.development.syncWakatime());
  }
}
