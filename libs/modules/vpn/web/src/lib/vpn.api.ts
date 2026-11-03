import {httpResource} from '@angular/common/http';
import {inject, Injectable} from '@angular/core';
import {VPN_READS, vpnApi} from '@pd/client-core';
import {
  VpnDay,
  VpnDeviceInput,
  VpnDeviceRename,
  VpnStatus,
} from '@pd/contracts';
import {DASHBOARD_CLIENT, fromCore} from '@pd/web-core';

/** The VPN requests of the client core (`@pd/client-core`) for Angular. */
@Injectable({providedIn: 'root'})
export class VpnApi {
  private readonly vpn = vpnApi(inject(DASHBOARD_CLIENT).api);

  /** The server's state and the devices; call it in a component field. */
  status() {
    return httpResource<VpnStatus>(() => VPN_READS.status());
  }

  days(days: () => number) {
    return httpResource<VpnDay[]>(() => VPN_READS.days(days()), {
      defaultValue: [],
    });
  }

  config(id: string) {
    return fromCore(() => this.vpn.config(id));
  }

  addDevice(input: VpnDeviceInput) {
    return fromCore(() => this.vpn.addDevice(input));
  }

  renameDevice(id: string, input: VpnDeviceRename) {
    return fromCore(() => this.vpn.renameDevice(id, input));
  }

  removeDevice(id: string) {
    return fromCore(() => this.vpn.removeDevice(id));
  }
}
