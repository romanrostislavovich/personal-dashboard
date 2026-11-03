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
  /**
   * AmneziaWG is free of battery limits: otherwise Android does not let it start the VPN when
   * the dashboard asks (absent in an app built before it).
   */
  unrestricted?: boolean;
}

export interface AmneziaVpnPlugin {
  status(): Promise<PhoneVpnStatus>;
  requestControl(): Promise<void>;
  setTunnel(options: {up: boolean; tunnel: string}): Promise<void>;
  openVpnSettings(): Promise<void>;
  openAmnezia(): Promise<void>;
  /** AmneziaWG's page in Android's settings (Battery → No restrictions). */
  openAmneziaSettings?(): Promise<void>;
}

/** The tunnel's name in AmneziaWG: the setup guide asks to name it so on the import. */
export const PHONE_TUNNEL = 'dashboard';

let plugin: AmneziaVpnPlugin | null = null;

/**
 * The VPN switched through AmneziaWG on the phone; `{plugin: null}` outside the app or in an app
 * built before it (the call fails — then there is nothing to show). Wrapped in an object: a
 * Capacitor plugin answers any property, `then` too, so an async function returning it bare
 * makes a promise that waits for that "then" forever.
 */
export async function phoneVpn(): Promise<{plugin: AmneziaVpnPlugin | null}> {
  if (!isMobileApp()) {
    return {plugin: null};
  }
  plugin ??= registerPlugin<AmneziaVpnPlugin>('AmneziaVpn');
  try {
    await plugin.status();
    return {plugin};
  } catch {
    return {plugin: null};
  }
}
