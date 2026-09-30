import { httpResource } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { MONITORING_READS, monitoringApi } from '@pd/client-core';
import { Monitor, MonitorInput } from '@pd/contracts';
import { DASHBOARD_CLIENT, fromCore } from '@pd/web-core';

/** The monitoring requests of the client core (`@pd/client-core`) for Angular. */
@Injectable({ providedIn: 'root' })
export class MonitoringApi {
  private readonly monitoring = monitoringApi(inject(DASHBOARD_CLIENT).api);

  monitors() {
    return httpResource<Monitor[]>(() => MONITORING_READS.monitors(), { defaultValue: [] });
  }

  add(input: MonitorInput) {
    return fromCore(() => this.monitoring.add(input));
  }

  remove(id: string) {
    return fromCore(() => this.monitoring.remove(id));
  }
}
