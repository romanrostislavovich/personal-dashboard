import { httpResource } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { CORE_READS, securityApi } from '@pd/client-core';
import { SecuritySettings, SecurityStatus } from '@pd/contracts';
import { DASHBOARD_CLIENT, fromCore } from '@pd/web-core';

/** The security agent's requests of the client core (`@pd/client-core`) for Angular. */
@Injectable({ providedIn: 'root' })
export class SecurityApi {
  private readonly security = securityApi(inject(DASHBOARD_CLIENT).api);

  status() {
    return httpResource<SecurityStatus>(() => CORE_READS.security());
  }

  scan() {
    return fromCore(() => this.security.scan());
  }

  investigate() {
    return fromCore(() => this.security.investigate());
  }

  saveSettings(settings: SecuritySettings) {
    return fromCore(() => this.security.saveSettings(settings));
  }

  writeGuide(id: string) {
    return fromCore(() => this.security.writeGuide(id));
  }

  setFindingStatus(id: string, status: 'open' | 'ignored') {
    return fromCore(() => this.security.setFindingStatus(id, status));
  }
}
