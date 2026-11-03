import {registerPlugin} from '@capacitor/core';
import {isMobileApp} from './mobile-app';

/** What the phone knows of AmneziaWG (AmneziaVpnPlugin in apps/mobile). */
export interface PhoneVpnStatus {
  /** The AmneziaWG app is on the phone. */
  installed: boolean;
  /** The dashboard may switch its tunnels (Android's permission, asked once). */
  control: boolean;
  /** A VPN carries the phone's traffic now. */
  vpnActive: boolean;
}

interface AmneziaVpnPlugin {
  status(): Promise<PhoneVpnStatus>;
  requestControl(): Promise<void>;
  setTunnel(options: {up: boolean; tunnel: string}): Promise<void>;
  openVpnSettings(): Promise<void>;
  openAmnezia(): Promise<void>;
}

/** The tunnel's name in AmneziaWG: the setup guide asks to name it so on the import. */
export const PHONE_TUNNEL = 'dashboard';

let plugin: AmneziaVpnPlugin | null = null;

/**
 * The VPN switched through AmneziaWG on the phone; `null` outside the app or in an app built
 * before it (the call fails — then there is nothing to show).
 */
export async function phoneVpn(): Promise<AmneziaVpnPlugin | null> {
  if (!isMobileApp()) {
    return null;
  }
  plugin ??= registerPlugin<AmneziaVpnPlugin>('AmneziaVpn');
  try {
    await plugin.status();
    return plugin;
  } catch {
    return null;
  }
}
