import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { SessionInfo, TwoFactorSetup, TwoFactorStatus } from '@pd/contracts';
import { DASHBOARD_CLIENT } from '../client/dashboard-client';
import { errorStatus } from '../client/core-requests';

/** Checked in order: Edge and the desktop app also say "Chrome". */
const BROWSERS: [RegExp, string][] = [
  [/Edg\//, 'Edge'],
  [/Electron/, 'Desktop app'],
  [/Firefox/, 'Firefox'],
  [/Chrome/, 'Chrome'],
  [/Safari/, 'Safari'],
];
const SYSTEMS: [RegExp, string][] = [
  [/Windows/, 'Windows'],
  [/Android/, 'Android'],
  [/iPhone|iPad/, 'iOS'],
  [/Mac OS/, 'macOS'],
  [/Linux/, 'Linux'],
];

/**
 * Account security: two-factor sign-in (an authenticator app, recovery codes) and the devices
 * signed in, each of which can be signed out.
 */
@Component({
  selector: 'pd-security-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatTooltipModule,
    TranslocoPipe,
  ],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-card-title>{{ 'core.settings.security.title' | transloco }}</mat-card-title>
      </mat-card-header>
      <mat-card-content>
        <h3 class="section">🔐 {{ 'core.settings.security.twoFactor' | transloco }}</h3>
        @if (status(); as s) {
          @if (recoveryCodes(); as codes) {
            <!-- Shown once, right after enabling -->
            <p>{{ 'core.settings.security.codesHint' | transloco }}</p>
            <ul class="codes">
              @for (code of codes; track code) {
                <li>{{ code }}</li>
              }
            </ul>
            <button matButton="tonal" (click)="copyCodes(codes)">
              <mat-icon>content_copy</mat-icon> {{ 'core.settings.security.copy' | transloco }}
            </button>
            <button matButton (click)="recoveryCodes.set(null)">
              {{ 'core.settings.security.saved' | transloco }}
            </button>
          } @else if (s.enabled) {
            <p class="state on">
              <mat-icon inline>verified_user</mat-icon>
              {{ 'core.settings.security.on' | transloco: { left: s.recoveryCodesLeft } }}
            </p>
            @if (disabling()) {
              <div class="inline-form">
                <mat-form-field subscriptSizing="dynamic">
                  <mat-label>{{ 'core.settings.password.current' | transloco }}</mat-label>
                  <input
                    matInput
                    type="password"
                    autocomplete="current-password"
                    [value]="password()"
                    (input)="password.set($any($event.target).value)"
                  />
                </mat-form-field>
                <mat-form-field subscriptSizing="dynamic">
                  <mat-label>{{ 'core.login.code' | transloco }}</mat-label>
                  <input
                    matInput
                    inputmode="numeric"
                    autocomplete="one-time-code"
                    [value]="code()"
                    (input)="code.set($any($event.target).value)"
                  />
                </mat-form-field>
                <button matButton="filled" [disabled]="busy()" (click)="disable()">
                  {{ 'core.settings.security.disable' | transloco }}
                </button>
              </div>
            } @else {
              <button matButton (click)="disabling.set(true)">
                {{ 'core.settings.security.disable' | transloco }}
              </button>
            }
          } @else if (setup(); as setup) {
            <p>{{ 'core.settings.security.scan' | transloco }}</p>
            <div class="setup">
              <img class="qr" [src]="setup.qrCode" alt="QR" />
              <div>
                <p class="secret-label">{{ 'core.settings.security.manual' | transloco }}</p>
                <code class="secret">{{ setup.secret }}</code>
                <div class="inline-form">
                  <mat-form-field subscriptSizing="dynamic">
                    <mat-label>{{ 'core.login.code' | transloco }}</mat-label>
                    <input
                      matInput
                      inputmode="numeric"
                      autocomplete="one-time-code"
                      [value]="code()"
                      (input)="code.set($any($event.target).value)"
                    />
                  </mat-form-field>
                  <button matButton="filled" [disabled]="busy()" (click)="enable()">
                    {{ 'core.settings.security.enable' | transloco }}
                  </button>
                </div>
              </div>
            </div>
          } @else {
            <p class="state">{{ 'core.settings.security.off' | transloco }}</p>
            <button matButton="filled" [disabled]="busy()" (click)="startSetup()">
              {{ 'core.settings.security.turnOn' | transloco }}
            </button>
          }
        }

        <h3 class="section">💻 {{ 'core.settings.security.devices' | transloco }}</h3>
        @for (session of sessions(); track session.id) {
          <div class="device" [class.current]="session.current">
            <mat-icon>{{ deviceIcon(session) }}</mat-icon>
            <span class="device-body">
              <span class="device-name">
                {{ deviceName(session) }}
                @if (session.current) {
                  <span class="badge">{{ 'core.settings.security.thisDevice' | transloco }}</span>
                }
              </span>
              <span class="device-meta">
                {{ session.ip ?? '—' }} ·
                {{ 'core.settings.security.lastUsed' | transloco }}
                {{ session.lastUsedAt | date: 'd MMM, HH:mm' }}
              </span>
            </span>
            @if (!session.current) {
              <button
                matIconButton
                [matTooltip]="'core.settings.security.signOut' | transloco"
                [attr.aria-label]="'core.settings.security.signOut' | transloco"
                (click)="revoke(session)"
              >
                <mat-icon>logout</mat-icon>
              </button>
            }
          </div>
        }
        @if (sessions().length > 1) {
          <button matButton (click)="revokeOthers()">
            {{ 'core.settings.security.signOutOthers' | transloco }}
          </button>
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    .section {
      margin: 16px 0 8px;
      font: var(--mat-sys-title-small);
    }
    .state {
      display: flex;
      align-items: center;
      gap: 6px;
      color: var(--mat-sys-on-surface-variant);
    }
    .state.on {
      color: var(--pd-success);
    }
    .setup {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      align-items: flex-start;
    }
    .qr {
      width: 180px;
      height: 180px;
      border-radius: 12px;
      background: #fff;
    }
    .secret-label {
      margin: 0 0 4px;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .secret {
      display: block;
      margin-bottom: 12px;
      word-break: break-all;
    }
    .inline-form {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      margin-top: 8px;
    }
    .codes {
      display: grid;
      grid-template-columns: repeat(2, max-content);
      gap: 4px 24px;
      padding-left: 20px;
      font-family: monospace;
    }
    .device {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 0;
      border-bottom: 1px solid var(--pd-border);
    }
    .device-body {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .device-meta {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .badge {
      margin-left: 6px;
      padding: 1px 6px;
      border-radius: 6px;
      font: var(--mat-sys-label-small);
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
    }
  `,
})
export class SecuritySettingsComponent {
  private readonly auth = inject(DASHBOARD_CLIENT).auth;
  private readonly snackBar = inject(MatSnackBar);
  private readonly transloco = inject(TranslocoService);

  protected readonly status = signal<TwoFactorStatus | null>(null);
  protected readonly setup = signal<TwoFactorSetup | null>(null);
  protected readonly recoveryCodes = signal<string[] | null>(null);
  protected readonly sessions = signal<SessionInfo[]>([]);
  protected readonly disabling = signal(false);
  protected readonly code = signal('');
  protected readonly password = signal('');
  protected readonly busy = signal(false);

  constructor() {
    void this.load();
  }

  protected async startSetup(): Promise<void> {
    await this.run(async () => this.setup.set(await this.auth.setupTwoFactor()));
  }

  protected async enable(): Promise<void> {
    await this.run(async () => {
      const { recoveryCodes } = await this.auth.enableTwoFactor(this.code());
      this.setup.set(null);
      this.code.set('');
      this.recoveryCodes.set(recoveryCodes);
      await this.load();
    });
  }

  protected async disable(): Promise<void> {
    await this.run(async () => {
      await this.auth.disableTwoFactor({ password: this.password(), code: this.code() });
      this.disabling.set(false);
      this.password.set('');
      this.code.set('');
      this.notify('core.settings.security.disabled');
      await this.load();
    });
  }

  protected async copyCodes(codes: string[]): Promise<void> {
    await navigator.clipboard.writeText(codes.join('\n'));
    this.notify('core.settings.security.copied');
  }

  protected async revoke(session: SessionInfo): Promise<void> {
    await this.auth.revokeSession(session.id);
    await this.load();
  }

  protected async revokeOthers(): Promise<void> {
    await this.auth.revokeOtherSessions();
    await this.load();
  }

  /** A short name from the browser's user agent: "Chrome · Windows". */
  protected deviceName(session: SessionInfo): string {
    const agent = session.userAgent ?? '';
    const browser = BROWSERS.find(([pattern]) => pattern.test(agent))?.[1] ?? (agent ? 'App' : '—');
    const system = SYSTEMS.find(([pattern]) => pattern.test(agent))?.[1];
    return system ? `${browser} · ${system}` : browser;
  }

  protected deviceIcon(session: SessionInfo): string {
    return /Android|iPhone|iPad|Mobile/.test(session.userAgent ?? '') ? 'smartphone' : 'computer';
  }

  private async load(): Promise<void> {
    const [status, sessions] = await Promise.all([
      this.auth.twoFactorStatus(),
      this.auth.sessions(),
    ]);
    this.status.set(status);
    this.sessions.set(sessions);
  }

  private async run(step: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    try {
      await step();
    } catch (error) {
      this.notify(
        errorStatus(error) === 429
          ? 'core.login.tooMany'
          : errorStatus(error) === 400
            ? 'core.settings.security.wrong'
            : 'core.login.error',
      );
    } finally {
      this.busy.set(false);
    }
  }

  private notify(key: string): void {
    this.snackBar.open(this.transloco.translate(key), 'OK', { duration: 4000 });
  }
}
