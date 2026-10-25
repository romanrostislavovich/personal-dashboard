import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal, Type } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatTabsModule } from '@angular/material/tabs';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { map } from 'rxjs';
import { DASHBOARD_MODULES, DashboardIntegration } from '../dashboard-module';
import { PasswordSettingsComponent } from './password-settings.component';
import { ProfileSettingsComponent } from './profile-settings.component';
import { SectionsSettingsComponent } from './sections-settings.component';
import { SecuritySettingsComponent } from './security-settings.component';
import { SyncSettingsComponent } from './sync-settings.component';
import { McpSettingsComponent } from './mcp-settings.component';
import { NotificationLogComponent } from './notification-log.component';
import { SystemSettingsComponent } from './system-settings.component';
import { CalmSettingsComponent } from './calm-settings.component';
import { PushSettingsComponent } from './push-settings.component';
import { TelegramSettingsComponent } from './telegram-settings.component';
import { ThemeSettingsComponent } from './theme-settings.component';
import { TrashSettingsComponent } from './trash-settings.component';
import { DataSettingsComponent } from './data-settings.component';
import { DeviceBackupSettingsComponent } from './device-backup-settings.component';
import { IntegrationStatusComponent } from './integration-status.component';
import { AutomationsSettingsComponent } from '../automations/automations-settings.component';
import { AppsSettingsComponent } from './apps-settings.component';
import { PhoneSensorsComponent } from './phone-sensors.component';

interface LoadedCard {
  id: string;
  component: Type<unknown>;
}

function load(cards: DashboardIntegration[]): Promise<LoadedCard[]> {
  return Promise.all(
    cards.map(async (card) => ({ id: card.id, component: await card.loadComponent() })),
  );
}

/** Tabs of the page, as `?tab=` names them: module pages link to `integrations`. */
const TABS = [
  'account',
  'appearance',
  'notifications',
  'integrations',
  'devices',
  'automations',
  'data',
  'apps',
  'system',
] as const;

/**
 * Settings: the account, the look (theme), the notifications (Telegram, push, the gentle mode), every connection
 * to an outside service (what the modules register as `integrations`), the devices (the phone as a sensor, the
 * desktop tracker, the copies on a computer — the same cards everywhere, a device's own marked), the data (sync,
 * export and import, trash), the apps to install and how the instance itself is doing (background jobs, the log
 * of errors).
 */
@Component({
  selector: 'pd-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatTabsModule,
    NgComponentOutlet,
    TranslocoPipe,
    ProfileSettingsComponent,
    IntegrationStatusComponent,
    PasswordSettingsComponent,
    SectionsSettingsComponent,
    SecuritySettingsComponent,
    TrashSettingsComponent,
    DataSettingsComponent,
    DeviceBackupSettingsComponent,
    AutomationsSettingsComponent,
    AppsSettingsComponent,
    PhoneSensorsComponent,
    SyncSettingsComponent,
    NotificationLogComponent,
    McpSettingsComponent,
    SystemSettingsComponent,
    TelegramSettingsComponent,
    PushSettingsComponent,
    CalmSettingsComponent,
    ThemeSettingsComponent,
  ],
  template: `
    <h1 class="page-title">{{ 'core.settings.title' | transloco }}</h1>

    <mat-tab-group
      [selectedIndex]="tabIndex()"
      (selectedIndexChange)="selectTab($event)"
      mat-stretch-tabs="false"
      mat-align-tabs="start"
    >
      <mat-tab [label]="'core.settings.tabs.account' | transloco">
        <div class="grid">
          <pd-profile-settings />
          <pd-password-settings />
          <pd-security-settings />
        </div>
      </mat-tab>

      <mat-tab [label]="'core.settings.tabs.appearance' | transloco">
        <div class="grid">
          <pd-theme-settings />
          <pd-sections-settings />
        </div>
      </mat-tab>

      <mat-tab [label]="'core.settings.tabs.notifications' | transloco">
        <p class="intro">{{ 'core.settings.notificationsIntro' | transloco }}</p>
        <div class="grid">
          <pd-telegram-settings />
          <pd-push-settings />
          <pd-calm-settings />
          <pd-notification-log />
        </div>
      </mat-tab>

      <mat-tab [label]="'core.settings.tabs.integrations' | transloco">
        <p class="intro">{{ 'core.settings.integrationsIntro' | transloco }}</p>
        <pd-integration-status />
        <div class="grid">
          <pd-mcp-settings />
          @for (integration of integrations(); track integration.id) {
            <ng-container *ngComponentOutlet="integration.component" />
          }
        </div>
      </mat-tab>

      <mat-tab [label]="'core.settings.tabs.devices' | transloco">
        <ng-template matTabContent>
          <p class="intro">{{ 'core.settings.devicesIntro' | transloco }}</p>
          <div class="grid">
            <pd-phone-sensors />
            @for (card of deviceCards(); track card.id) {
              <ng-container *ngComponentOutlet="card.component" />
            }
            <pd-device-backup-settings />
          </div>
        </ng-template>
      </mat-tab>

      <mat-tab [label]="'core.settings.tabs.automations' | transloco">
        <ng-template matTabContent>
          <pd-automations-settings />
        </ng-template>
      </mat-tab>

      <mat-tab [label]="'core.settings.tabs.data' | transloco">
        <div class="grid">
          <pd-sync-settings />
          <pd-data-settings />
          <pd-trash-settings />
        </div>
      </mat-tab>

      <mat-tab [label]="'core.settings.tabs.apps' | transloco">
        <ng-template matTabContent>
          <pd-apps-settings />
        </ng-template>
      </mat-tab>

      <mat-tab [label]="'core.settings.tabs.system' | transloco">
        <!-- Loaded when opened: the log is of no use to the other tabs. -->
        <ng-template matTabContent>
          <div class="system">
            <pd-system-settings />
          </div>
        </ng-template>
      </mat-tab>
    </mat-tab-group>
  `,
  styles: `
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(min(420px, 100%), 1fr));
      gap: 16px;
      align-items: start;
      padding-top: 16px;
    }
    .system {
      max-width: 1000px;
      padding-top: 16px;
    }
    .intro {
      margin: 16px 0 0;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class SettingsPage {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  private readonly tab = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get('tab'))),
  );
  protected readonly tabIndex = computed(() =>
    Math.max(0, TABS.indexOf(this.tab() as (typeof TABS)[number])),
  );

  protected readonly integrations = signal<LoadedCard[]>([]);
  protected readonly deviceCards = signal<LoadedCard[]>([]);

  constructor() {
    const modules = inject(DASHBOARD_MODULES);
    void load(modules.flatMap((module) => module.integrations ?? [])).then((loaded) =>
      this.integrations.set(loaded),
    );
    void load(modules.flatMap((module) => module.devices ?? [])).then((loaded) =>
      this.deviceCards.set(loaded),
    );
  }

  /** The tab goes to the address: a reload or a link opens the same one. */
  protected selectTab(index: number): void {
    void this.router.navigate([], {
      queryParams: { tab: TABS[index] },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
