import { inject, Injectable } from '@angular/core';
import { DeviceLink, DeviceTool } from '@pd/client-core';
import { DASHBOARD_CLIENT } from '../client/dashboard-client';
import { desktopBridge } from './desktop-bridge';

/** Screenshots listed at most. */
const RECENT_SCREENSHOTS = 20;

/**
 * The computer as a device of the dashboard, from the page the desktop app shows (it holds the
 * session): while the app runs, the assistant and the outside AI clients may ask what window
 * is in front and which screenshots were taken lately (see device-tools in contracts).
 */
@Injectable({ providedIn: 'root' })
export class DesktopDeviceService {
  private readonly client = inject(DASHBOARD_CLIENT);
  private link: DeviceLink | null = null;

  start(): void {
    const desktop = desktopBridge();
    if (!desktop?.device || this.link) {
      return;
    }
    const device = desktop.device;
    const screenshots = desktop.screenshots;
    const tools: DeviceTool[] = [
      {
        name: 'computer_front_window',
        description:
          "The program and the window in front on the user's computer now, and how many seconds " +
          'there has been no keyboard or mouse input. A private window comes without its title.',
        inputSchema: { type: 'object', properties: {} },
        run: async () => (await device.frontWindow()) ?? { window: null },
      },
    ];
    if (screenshots) {
      tools.push({
        name: 'computer_recent_screenshots',
        description:
          "The names of the latest screenshots in the folder of the user's computer " +
          '(month/date time.png), newest first. Their pictures are in the Screenshots section.',
        inputSchema: { type: 'object', properties: {} },
        run: async () =>
          (await screenshots.list())
            .map((file) => file.name)
            .sort()
            .reverse()
            .slice(0, RECENT_SCREENSHOTS),
      });
    }
    this.link = new DeviceLink({
      server: location.origin,
      kind: 'computer',
      name: desktop.activity?.hostname || 'Computer',
      // A fresh token for every hello: the one in the session may be past its fifteen minutes.
      accessToken: async () =>
        (await this.client.api.refresh())?.accessToken ?? this.client.session.token,
      tools: () => tools,
    });
    this.link.start();
    // The user is at this computer when its window has the focus.
    window.addEventListener('focus', () => this.link?.active());
  }
}
