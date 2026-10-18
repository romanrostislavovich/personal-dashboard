import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { BankConnection } from '@pd/contracts';
import {
  errorBody,
  errorStatus,
  IntegrationGuideComponent,
  ServerKeyComponent,
  ServerKeyField,
} from '@pd/web-core';
import { firstValueFrom } from 'rxjs';
import { FinanceApi } from './finance.api';
import { StatementImportButton } from './statement-import.button';

/** The countries Enable Banking reaches, the user's own first. */
const COUNTRIES = [
  'PL',
  'AT',
  'BE',
  'CZ',
  'DE',
  'DK',
  'EE',
  'ES',
  'FI',
  'FR',
  'IE',
  'IT',
  'LT',
  'LV',
  'NL',
  'NO',
  'PT',
  'SE',
] as const;
/** A consent ending within this many days is shown as ending soon. */
const SOON_DAYS = 7;

/**
 * The bank directly (open banking), in Settings → Integrations (see `integrations` in
 * finance.module.ts): for the owner the application at Enable Banking, for everyone the banks
 * connected — their accounts switched on or off, the consent and when it ends — and connecting
 * one more: a country, a bank, the bank's own sign-in, and back here.
 */
@Component({
  selector: 'pd-bank-integration',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    IntegrationGuideComponent,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatTooltipModule,
    ServerKeyComponent,
    StatementImportButton,
    TranslocoPipe,
  ],
  template: `
    @if (state.value(); as s) {
      <mat-card appearance="outlined" id="pd-bank">
        <mat-card-header>
          <mat-icon mat-card-avatar>account_balance</mat-icon>
          <mat-card-title>{{ 'finance.bank.title' | transloco }}</mat-card-title>
          <mat-card-subtitle>{{ 'finance.bank.hint' | transloco }}</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          @if (!s.available) {
            <p class="hint">{{ 'finance.bank.notSet' | transloco }}</p>
          }

          @for (connection of s.connections; track connection.id) {
            <section class="connection" [class.chosen]="connection.id === justConnected()">
              <div class="head">
                <span class="name">{{ connection.bank }}</span>
                <span class="meta">
                  @if (connection.expired) {
                    <span class="error">{{ 'finance.bank.expired' | transloco }}</span>
                  } @else if (connection.validUntil) {
                    <span [class.warn]="soon(connection)">
                      {{
                        'finance.bank.validUntil'
                          | transloco: { date: (connection.validUntil | date: 'mediumDate') }
                      }}
                    </span>
                  }
                  @if (connection.lastSyncedAt) {
                    · {{ 'finance.bank.synced' | transloco }}
                    {{ connection.lastSyncedAt | date: 'd MMM, HH:mm' }}
                  }
                </span>
                <span class="actions">
                  @if (connection.expired || soon(connection)) {
                    <button matButton="tonal" [disabled]="busy()" (click)="renew(connection)">
                      {{ 'finance.bank.renew' | transloco }}
                    </button>
                  }
                  <button
                    matIconButton
                    [matTooltip]="'finance.bank.syncNow' | transloco"
                    [disabled]="busy() || connection.expired"
                    (click)="sync(connection)"
                  >
                    <mat-icon>sync</mat-icon>
                  </button>
                  <button
                    matIconButton
                    [matTooltip]="'core.actions.delete' | transloco"
                    [disabled]="busy()"
                    (click)="remove(connection)"
                  >
                    <mat-icon>link_off</mat-icon>
                  </button>
                </span>
              </div>
              @if (connection.lastError) {
                <p class="error">{{ connection.lastError }}</p>
              }
              @if (connection.id === justConnected() && !anyEnabled(connection)) {
                <p class="choose">
                  <mat-icon inline>touch_app</mat-icon>
                  {{ 'finance.bank.choose' | transloco }}
                </p>
              }
              <ul class="accounts">
                @for (account of connection.accounts; track account.id) {
                  <li>
                    <mat-slide-toggle
                      [checked]="account.enabled"
                      [disabled]="busy()"
                      (change)="setAccount(account.id, $event.checked)"
                    >
                      {{ account.name || ('finance.bank.account' | transloco) }}
                      @if (account.ibanEnd) {
                        · ••{{ account.ibanEnd }}
                      }
                      @if (account.currency) {
                        · {{ account.currency }}
                      }
                    </mat-slide-toggle>
                  </li>
                } @empty {
                  <li class="hint">{{ 'finance.bank.noAccounts' | transloco }}</li>
                }
              </ul>
            </section>
          }

          @if (s.available) {
            <div class="connect">
              <mat-form-field subscriptSizing="dynamic" class="country">
                <mat-label>{{ 'finance.bank.country' | transloco }}</mat-label>
                <mat-select [value]="country()" (selectionChange)="choose($event.value)">
                  @for (code of countries; track code) {
                    <mat-option [value]="code">{{ code }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
              <mat-form-field subscriptSizing="dynamic" class="bank">
                <mat-label>{{ 'finance.bank.bank' | transloco }}</mat-label>
                <mat-select [value]="bank()" (selectionChange)="bank.set($event.value)">
                  @for (option of banks.value(); track option.name) {
                    <mat-option [value]="option.name">{{ option.name }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
              @if (banks.error(); as error) {
                <p class="hint error">{{ failure(error) }}</p>
              }
              <button matButton="filled" [disabled]="busy() || !bank()" (click)="connect()">
                <mat-icon>add_link</mat-icon> {{ 'finance.bank.connect' | transloco }}
              </button>
            </div>
            <p class="hint">{{ 'finance.bank.consent' | transloco }}</p>
          }

          <div class="statement">
            <pd-statement-import (imported)="state.reload()" />
            <span class="hint">{{ 'finance.statement.free' | transloco }}</span>
          </div>

          @if (s.connections.length) {
            <div class="statement">
              <button matButton="tonal" [disabled]="busy()" (click)="resort()">
                <mat-icon>category</mat-icon> {{ 'finance.bank.resort' | transloco }}
              </button>
              <span class="hint">{{ 'finance.bank.resortHint' | transloco }}</span>
            </div>
          }

          @if (s.app; as app) {
            <pd-server-key
              [fields]="fields"
              [set]="s.available"
              [summary]="app.appId || null"
              [initial]="{ appId: app.appId || null }"
              [save]="save"
              [remove]="removeApp"
              (changed)="state.reload()"
            />
            <p class="hint">
              {{ 'finance.bank.redirect' | transloco }} <code>{{ app.redirectUrl }}</code>
            </p>
            <pd-integration-guide
              guide="finance.bank.guide"
              [steps]="4"
              link="https://enablebanking.com/cp/applications"
              title="Enable Banking"
            />
          }
        </mat-card-content>
      </mat-card>
    }
  `,
  styles: `
    mat-card-content {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding-top: 8px;
    }
    .hint {
      margin: 0;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .hint.error {
      color: var(--mat-sys-error);
    }
    .error {
      margin: 0;
      color: var(--mat-sys-error);
    }
    .warn {
      color: var(--mat-sys-tertiary);
      font-weight: 600;
    }
    .connection {
      padding: 12px;
      border-radius: 12px;
      background: var(--mat-sys-surface-container);
    }
    .connection.chosen {
      outline: 2px solid var(--mat-sys-primary);
    }
    .head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px 12px;
    }
    .name {
      font: var(--mat-sys-title-small);
    }
    .meta {
      flex: 1;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .actions {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .choose {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 8px 0 0;
      color: var(--mat-sys-primary);
    }
    .accounts {
      list-style: none;
      margin: 8px 0 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .connect {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px;
    }
    .country {
      width: 110px;
    }
    .bank {
      width: min(100%, 320px);
    }
    code {
      word-break: break-all;
    }
    .statement {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 12px;
    }
  `,
})
export class BankIntegration {
  private readonly api = inject(FinanceApi);
  private readonly snackBar = inject(MatSnackBar);
  private readonly transloco = inject(TranslocoService);
  private readonly route = inject(ActivatedRoute);

  protected readonly countries = COUNTRIES;
  protected readonly state = this.api.bank();
  protected readonly country = signal<string>(COUNTRIES[0]);
  protected readonly bank = signal<string | null>(null);
  protected readonly banks = this.api.bankBanks(() =>
    this.state.value()?.available ? this.country() : null,
  );
  protected readonly busy = signal(false);
  /** Back from the bank: the connection whose accounts are to be chosen. */
  protected readonly justConnected = signal<string | null>(null);

  protected readonly fields: ServerKeyField[] = [
    {
      name: 'appId',
      label: 'finance.bank.appId',
      placeholder: '00000000-0000-0000-0000-000000000000',
    },
    {
      name: 'privateKey',
      label: 'finance.bank.privateKey',
      secret: true,
      multiline: true,
      placeholder: '-----BEGIN PRIVATE KEY-----',
    },
  ];
  protected readonly save = (values: Record<string, string>) =>
    firstValueFrom(
      this.api.setBankApp({ appId: values['appId'], privateKey: values['privateKey'] }),
    );
  protected readonly removeApp = () => firstValueFrom(this.api.removeBankApp());

  private readonly enabledByConnection = computed(
    () =>
      new Map(
        (this.state.value()?.connections ?? []).map((connection) => [
          connection.id,
          connection.accounts.some((account) => account.enabled),
        ]),
      ),
  );

  constructor() {
    const params = this.route.snapshot.queryParamMap;
    const result = params.get('bank');
    if (result) {
      this.justConnected.set(params.get('connection'));
      const key =
        result === 'error'
          ? 'finance.bank.callbackError'
          : result === 'renewed'
            ? 'finance.bank.renewed'
            : 'finance.bank.connected';
      this.snackBar.open(this.transloco.translate(key), 'OK', { duration: 8000 });
      setTimeout(() => document.getElementById('pd-bank')?.scrollIntoView({ block: 'start' }), 300);
    }
  }

  protected soon(connection: BankConnection): boolean {
    return (
      !!connection.validUntil &&
      new Date(connection.validUntil).getTime() - Date.now() < SOON_DAYS * 24 * 60 * 60 * 1000
    );
  }

  protected anyEnabled(connection: BankConnection): boolean {
    return this.enabledByConnection().get(connection.id) ?? false;
  }

  protected choose(country: string): void {
    this.country.set(country);
    this.bank.set(null);
  }

  protected async connect(connectionId?: string, bank = this.bank(), country = this.country()) {
    if (!bank) {
      return;
    }
    await this.run(async () => {
      const { url } = await firstValueFrom(
        this.api.connectBank({ bank, country, ...(connectionId ? { connectionId } : {}) }),
      );
      // The bank's own page: the user signs in there and comes back to the callback.
      window.location.href = url;
    });
  }

  protected renew(connection: BankConnection): Promise<void> {
    return this.connect(connection.id, connection.bank, connection.country);
  }

  protected setAccount(id: string, enabled: boolean): Promise<void> {
    return this.run(() => firstValueFrom(this.api.setBankAccount(id, enabled)));
  }

  protected async sync(connection: BankConnection): Promise<void> {
    await this.run(async () => {
      const result = await firstValueFrom(this.api.syncBank(connection.id));
      this.snackBar.open(this.transloco.translate('finance.bank.syncResult', result), 'OK', {
        duration: 6000,
      });
    });
  }

  /** The bank's transactions still uncategorized, sorted again (a first import has many). */
  protected async resort(): Promise<void> {
    await this.run(async () => {
      const result = await firstValueFrom(this.api.resortBank());
      this.snackBar.open(this.transloco.translate('finance.bank.resortResult', result), 'OK', {
        duration: 8000,
      });
    });
  }

  protected async remove(connection: BankConnection): Promise<void> {
    if (
      confirm(this.transloco.translate('finance.bank.confirmDelete', { bank: connection.bank }))
    ) {
      await this.run(() => firstValueFrom(this.api.removeBank(connection.id)));
    }
  }

  /** A refusal (400) with the provider's own words; anything else — the plain text. */
  protected failure(error: unknown): string {
    const status = errorStatus(error);
    const said = (errorBody(error) as { message?: unknown } | null)?.message;
    if (status === 400 && typeof said === 'string') {
      return this.transloco.translate('finance.bank.refused', { message: said });
    }
    return this.transloco.translate(
      status === 503 ? 'finance.bank.unreachable' : 'finance.bank.failed',
    );
  }

  private async run(action: () => Promise<unknown>): Promise<void> {
    this.busy.set(true);
    try {
      await action();
      this.state.reload();
    } catch (error) {
      this.snackBar.open(this.failure(error), 'OK', { duration: 10000 });
    } finally {
      this.busy.set(false);
    }
  }
}
