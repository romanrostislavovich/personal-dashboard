import { httpResource } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { HEALTH_READS, healthApi } from '@pd/client-core';
import { HealthRecord, IcdDictionary } from '@pd/contracts';
import { DASHBOARD_CLIENT, fromCore } from '@pd/web-core';

/** The Health requests of the client core (`@pd/client-core`) for Angular. */
@Injectable({ providedIn: 'root' })
export class HealthApi {
  /** The writes, as promises: the dialogs await them and stay open on an error. */
  readonly client = healthApi(inject(DASHBOARD_CLIENT).api);

  record() {
    return httpResource<HealthRecord>(() => HEALTH_READS.record());
  }

  dictionaries() {
    return httpResource<IcdDictionary[]>(() => HEALTH_READS.dictionaries(), {
      defaultValue: [],
    });
  }

  searchIcd(q: string) {
    return fromCore(() => this.client.searchIcd(q, 15));
  }
}
