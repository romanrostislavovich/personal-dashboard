import {
  VpnDay,
  VpnDevice,
  VpnDeviceConfig,
  VpnDeviceInput,
  VpnDeviceUpdate,
  VpnStatus,
} from '@pd/contracts';
import {ApiClient, apiRequest} from '../api-client';

// The requests of the VPN module: every client (web, phone, desktop) goes through these.

export const VPN_READS = {
  /** The server's state and the devices. */
  status: () => apiRequest('/api/vpn'),
  /** The last `days` days of all devices, oldest first. */
  days: (days: number) => apiRequest('/api/vpn/days', {days}),
  /** A device's config with its keys: shown as a QR code or saved as a file. */
  config: (id: string) => apiRequest(`/api/vpn/devices/${id}/config`),
};

export function vpnApi(api: ApiClient) {
  return {
    status: () => api.read<VpnStatus>(VPN_READS.status()),
    days: (days: number) => api.read<VpnDay[]>(VPN_READS.days(days)),
    config: (id: string) => api.read<VpnDeviceConfig>(VPN_READS.config(id)),
    addDevice: (input: VpnDeviceInput) =>
      api.post<VpnDevice>('/api/vpn/devices', input),
    updateDevice: (id: string, input: VpnDeviceUpdate) =>
      api.patch<void>(`/api/vpn/devices/${id}`, input),
    removeDevice: (id: string) => api.delete(`/api/vpn/devices/${id}`),
  };
}
