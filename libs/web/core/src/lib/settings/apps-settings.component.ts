import {DatePipe} from '@angular/common';
import {httpResource} from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatCardModule} from '@angular/material/card';
import {MatIconModule} from '@angular/material/icon';
import {TranslocoPipe} from '@jsverse/transloco';
import {appsApi, CORE_READS} from '@pd/client-core';
import {AppInfo, AppInstall, AppKind, AppsOverview} from '@pd/contracts';
import {DesktopInstallService} from '../apps/desktop-install.service';
import {apiBaseUrl, isMobileApp} from '../mobile/mobile-app';
import {MobileAppService} from '../mobile/mobile-app.service';
import {DASHBOARD_CLIENT} from '../client/dashboard-client';
import {DesktopAppsInfo, desktopBridge} from '../realtime/desktop-bridge';

const ICONS: Record<AppKind, string> = {
  desktop: 'desktop_windows',
  extension: 'extension',
  mobile: 'smartphone',
};

/**
 * Settings → Apps: the desktop app, the browser extension and the Android app — where to
 * get them, how they update, and the devices that run them with their versions.
 */
@Component({
  selector: 'pd-apps-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    TranslocoPipe,
  ],
  template: `
    <div class="grid">
      @for (app of apps(); track app.kind) {
        <mat-card appearance="outlined">
          <mat-card-header>
            <mat-icon mat-card-avatar>{{ icons[app.kind] }}</mat-icon>
            <mat-card-title>{{
              'core.settings.apps.' + app.kind + '.title' | transloco
            }}</mat-card-title>
            <mat-card-subtitle>
              @if (app.soon) {
                {{ 'core.settings.apps.soon' | transloco }}
              } @else if (app.version) {
                {{
                  'core.settings.apps.serverVersion'
                    | transloco: {version: short(app.version)}
                }}
              }
            </mat-card-subtitle>
          </mat-card-header>
          <mat-card-content class="content">
            <p>{{ 'core.settings.apps.' + app.kind + '.about' | transloco }}</p>

            @if (app.kind === 'desktop') {
              <div class="downloads">
                @for (download of app.downloads; track download.platform) {
                  <a
                    matButton="tonal"
                    [href]="href(download.url)"
                    [attr.target]="download.external ? '_blank' : null"
                    rel="noopener"
                  >
                    <mat-icon>{{
                      download.external ? 'open_in_new' : 'download'
                    }}</mat-icon>
                    {{
                      'core.settings.apps.platforms.' + download.platform
                        | transloco
                    }}
                    @if (download.size) {
                      <span class="size">{{ megabytes(download.size) }}</span>
                    }
                  </a>
                }
              </div>
              <p class="hint">
                {{ 'core.settings.apps.desktop.updates' | transloco }}
              </p>
            }

            @if (app.kind === 'extension') {
              @if (desktop(); as info) {
                <ol class="steps">
                  <li>
                    {{
                      'core.settings.apps.extension.withDesktop.folder'
                        | transloco
                    }}
                    <code class="folder">{{ info.extension.folder }}</code>
                    <button matButton="tonal" (click)="openExtensionFolder()">
                      <mat-icon>folder_open</mat-icon>
                      {{
                        'core.settings.apps.extension.openFolder' | transloco
                      }}
                    </button>
                  </li>
                  <li>
                    {{ 'core.settings.apps.extension.chrome' | transloco }}
                  </li>
                  <li>
                    {{ 'core.settings.apps.extension.loadFolder' | transloco }}
                  </li>
                </ol>
                <p class="hint">
                  {{
                    'core.settings.apps.extension.withDesktop.updates'
                      | transloco
                  }}
                </p>
              } @else {
                <div class="downloads">
                  @for (download of app.downloads; track download.platform) {
                    <a matButton="tonal" [href]="href(download.url)" download>
                      <mat-icon>download</mat-icon>
                      {{ 'core.settings.apps.extension.zip' | transloco }}
                      @if (download.size) {
                        <span class="size">{{ megabytes(download.size) }}</span>
                      }
                    </a>
                  } @empty {
                    <p class="hint">
                      {{
                        'core.settings.apps.extension.notOnServer' | transloco
                      }}
                    </p>
                  }
                </div>
                <ol class="steps">
                  <li>
                    {{ 'core.settings.apps.extension.unzip' | transloco }}
                  </li>
                  <li>
                    {{ 'core.settings.apps.extension.chrome' | transloco }}
                  </li>
                  <li>
                    {{ 'core.settings.apps.extension.loadFolder' | transloco }}
                  </li>
                </ol>
                <p class="hint">
                  {{
                    'core.settings.apps.extension.withoutDesktop' | transloco
                  }}
                </p>
              }
            }

            @if (app.kind === 'mobile') {
              <div class="downloads">
                @for (download of app.downloads; track download.platform) {
                  <!-- A new tab: inside the app the phone's browser downloads and installs it -->
                  <a
                    matButton="tonal"
                    [href]="href(download.url)"
                    target="_blank"
                    rel="noopener"
                  >
                    <mat-icon>download</mat-icon>
                    {{ 'core.settings.apps.mobile.apk' | transloco }}
                    @if (download.size) {
                      <span class="size">{{ megabytes(download.size) }}</span>
                    }
                  </a>
                } @empty {
                  <p class="hint">
                    {{ 'core.settings.apps.mobile.notOnServer' | transloco }}
                  </p>
                }
              </div>
              <ol class="steps">
                <li>
                  {{ 'core.settings.apps.mobile.openOnPhone' | transloco }}
                </li>
                <li>
                  {{ 'core.settings.apps.mobile.allowInstall' | transloco }}
                </li>
                <li>{{ 'core.settings.apps.mobile.connect' | transloco }}</li>
              </ol>
              <p class="hint">
                {{ 'core.settings.apps.mobile.updates' | transloco }}
              </p>
            }
          </mat-card-content>
        </mat-card>
      }
    </div>

    <mat-card appearance="outlined" class="devices">
      <mat-card-header>
        <mat-card-title>{{
          'core.settings.apps.devices.title' | transloco
        }}</mat-card-title>
        <mat-card-subtitle>{{
          'core.settings.apps.devices.subtitle' | transloco
        }}</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        @for (install of installs(); track install.id) {
          <div class="device">
            <mat-icon>{{ icons[install.kind] }}</mat-icon>
            <div class="what">
              <div class="name">
                {{ install.name }}
                @if (install.id === thisDevice()) {
                  <span class="this">{{
                    'core.settings.apps.devices.this' | transloco
                  }}</span>
                }
              </div>
              <div class="hint">
                {{
                  'core.settings.apps.' + install.kind + '.title' | transloco
                }}
                · {{ short(install.version) }} ·
                {{
                  'core.settings.apps.devices.seen'
                    | transloco
                      : {date: (install.lastSeenAt | date: 'd MMM, HH:mm')}
                }}
              </div>
            </div>
            @if (install.current) {
              <span class="status ok"
                ><mat-icon>check_circle</mat-icon>
                {{ 'core.settings.apps.devices.current' | transloco }}</span
              >
            } @else if (serverVersion(install.kind)) {
              <span class="status old"
                ><mat-icon>update</mat-icon>
                {{ 'core.settings.apps.devices.outdated' | transloco }}</span
              >
            }
            <button
              matIconButton
              [attr.aria-label]="
                'core.settings.apps.devices.forget' | transloco
              "
              [title]="'core.settings.apps.devices.forget' | transloco"
              (click)="forget(install)"
            >
              <mat-icon>close</mat-icon>
            </button>
          </div>
        } @empty {
          <p class="hint">
            {{ 'core.settings.apps.devices.none' | transloco }}
          </p>
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(min(360px, 100%), 1fr));
      gap: 16px;
      align-items: start;
      padding-top: 16px;
    }
    .content {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .content p {
      margin: 0;
    }
    .downloads {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .size {
      margin-left: 6px;
      opacity: 0.7;
      font-size: 12px;
    }
    .steps {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin: 0;
      padding-left: 20px;
    }
    .steps button {
      margin-top: 6px;
    }
    .folder {
      display: block;
      margin-top: 4px;
      overflow-wrap: anywhere;
      font-size: 12px;
    }
    .hint {
      color: var(--mat-sys-on-surface-variant);
      font-size: 13px;
    }
    .devices {
      margin-top: 16px;
    }
    .device {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 0;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }
    .device:last-child {
      border-bottom: 0;
    }
    .what {
      flex: 1;
      min-width: 0;
    }
    .this {
      margin-left: 6px;
      color: var(--mat-sys-primary);
      font-size: 12px;
    }
    .status {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 13px;
      white-space: nowrap;
    }
    .status mat-icon {
      width: 18px;
      height: 18px;
      font-size: 18px;
    }
    .status.ok {
      color: var(--mat-sys-primary);
    }
    .status.old {
      color: var(--mat-sys-error);
    }
  `,
})
export class AppsSettingsComponent {
  private readonly apps$ = appsApi(inject(DASHBOARD_CLIENT).api);
  private readonly bridge = desktopBridge()?.apps ?? null;
  private readonly desktopInstall = inject(DesktopInstallService);
  private readonly mobile = inject(MobileAppService);

  protected readonly icons = ICONS;
  protected readonly overview = httpResource<AppsOverview>(() =>
    CORE_READS.apps(),
  );
  protected readonly apps = computed<AppInfo[]>(
    () => this.overview.value()?.apps ?? [],
  );
  protected readonly installs = computed<AppInstall[]>(
    () => this.overview.value()?.installs ?? [],
  );
  /** Opened inside the desktop app: the extension is installed from its folder. */
  protected readonly desktop = signal<DesktopAppsInfo | null>(null);
  protected readonly thisDevice = computed(
    () => this.desktop()?.installId ?? null,
  );

  constructor() {
    if (this.bridge) {
      void this.bridge.info().then(info => this.desktop.set(info));
      // The list shows this computer as it is now.
      void this.desktopInstall.report().then(() => this.overview.reload());
    }
    if (isMobileApp()) {
      void this.mobile.report().then(() => this.overview.reload());
    }
  }

  /** A file of the server: inside the Android app the page's own address is not the server. */
  protected href(url: string): string {
    return url.startsWith('/') ? `${apiBaseUrl()}${url}` : url;
  }

  protected serverVersion(kind: AppKind): string | null {
    return this.apps().find(app => app.kind === kind)?.version ?? null;
  }

  protected async openExtensionFolder(): Promise<void> {
    await this.bridge?.openExtensionFolder();
    this.desktop.set((await this.bridge?.info()) ?? null);
  }

  protected async forget(install: AppInstall): Promise<void> {
    await this.apps$.forget(install.id);
    this.overview.reload();
  }

  /** A commit of the desktop app or the extension is cut to 7 signs; `0.3.0.450` stays whole. */
  protected short(version: string): string {
    return /^\d+(\.\d+)+$/.test(version) ? version : version.slice(0, 7);
  }

  protected megabytes(bytes: number): string {
    return bytes >= 1024 * 1024
      ? `${(bytes / 1024 / 1024).toFixed(0)} MB`
      : `${Math.ceil(bytes / 1024)} KB`;
  }
}
