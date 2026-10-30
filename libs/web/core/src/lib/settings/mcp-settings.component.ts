import {Clipboard} from '@angular/cdk/clipboard';
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
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatTooltipModule} from '@angular/material/tooltip';
import {TranslocoPipe, TranslocoService} from '@jsverse/transloco';
import {accessTokensApi, CORE_READS} from '@pd/client-core';
import {AccessTokenCreated, AccessTokenScope, McpInfo} from '@pd/contracts';
import {DASHBOARD_CLIENT} from '../client/dashboard-client';

/** How a client is connected, with the address and the token put in. */
type Client = 'claudeCode' | 'claudeDesktop' | 'cursor';

/**
 * The dashboard for outside AI clients (MCP): Claude Desktop, Claude Code, Cursor call the
 * assistant's tools with an access token. The tokens are made and revoked here; a new one is
 * shown once, right in the lines that connect each client.
 */
@Component({
  selector: 'pd-mcp-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatTooltipModule,
    TranslocoPipe,
  ],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-icon mat-card-avatar>hub</mat-icon>
        <mat-card-title>{{
          'core.settings.mcp.title' | transloco
        }}</mat-card-title>
        <mat-card-subtitle>{{
          'core.settings.mcp.hint' | transloco
        }}</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        @if (info.value(); as current) {
          <form class="row" (submit)="$event.preventDefault(); create()">
            <mat-form-field subscriptSizing="dynamic">
              <mat-label>{{ 'core.settings.mcp.name' | transloco }}</mat-label>
              <input
                matInput
                maxlength="60"
                [placeholder]="'core.settings.mcp.namePlaceholder' | transloco"
                [value]="name()"
                (input)="name.set($any($event.target).value)"
              />
            </mat-form-field>
            <mat-form-field subscriptSizing="dynamic" class="narrow">
              <mat-label>{{ 'core.settings.mcp.scope' | transloco }}</mat-label>
              <mat-select [value]="scope()" (valueChange)="scope.set($event)">
                <mat-option value="read">{{
                  'core.settings.mcp.scopes.read' | transloco
                }}</mat-option>
                <mat-option value="write">{{
                  'core.settings.mcp.scopes.write' | transloco
                }}</mat-option>
              </mat-select>
            </mat-form-field>
            <button
              matButton="filled"
              type="submit"
              [disabled]="!name().trim() || busy()"
            >
              {{ 'core.settings.mcp.create' | transloco }}
            </button>
          </form>

          @if (created(); as fresh) {
            <p class="once">{{ 'core.settings.mcp.once' | transloco }}</p>
          }
          @for (client of clients; track client) {
            <h3>{{ 'core.settings.mcp.clients.' + client | transloco }}</h3>
            <div class="snippet">
              <pre>{{ snippet(client, current.url) }}</pre>
              <button
                matIconButton
                [matTooltip]="'core.settings.mcp.copy' | transloco"
                [attr.aria-label]="'core.settings.mcp.copy' | transloco"
                (click)="copy(snippet(client, current.url))"
              >
                <mat-icon>content_copy</mat-icon>
              </button>
            </div>
          }

          <h3>{{ 'core.settings.mcp.tokens' | transloco }}</h3>
          <ul class="tokens">
            @for (token of current.tokens; track token.id) {
              <li>
                <span class="body">
                  <span class="name">{{ token.name }}</span>
                  <span class="meta">
                    {{ token.hint }}… ·
                    {{ 'core.settings.mcp.scopes.' + token.scope | transloco }}
                    ·
                    {{ 'core.settings.mcp.created' | transloco }}
                    {{ token.createdAt | date: 'd MMM y' }}
                    ·
                    @if (token.lastUsedAt) {
                      {{ 'core.settings.mcp.used' | transloco }}
                      {{ token.lastUsedAt | date: 'd MMM, HH:mm' }}
                    } @else {
                      {{ 'core.settings.mcp.neverUsed' | transloco }}
                    }
                  </span>
                </span>
                <button matButton (click)="revoke(token.id)">
                  {{ 'core.settings.mcp.revoke' | transloco }}
                </button>
              </li>
            } @empty {
              <li class="hint">
                {{ 'core.settings.mcp.noTokens' | transloco }}
              </li>
            }
          </ul>
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    .row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px;
      margin: 8px 0 12px;
    }
    .row mat-form-field {
      flex: 1 1 220px;
    }
    .row mat-form-field.narrow {
      flex: 0 1 200px;
    }
    h3 {
      margin: 16px 0 6px;
      font: var(--mat-sys-title-small);
    }
    .once {
      margin: 0;
      padding: 8px 12px;
      border-radius: 8px;
      background: color-mix(in srgb, var(--mat-sys-primary) 12%, transparent);
    }
    .snippet {
      display: flex;
      align-items: flex-start;
      gap: 4px;
    }
    pre {
      flex: 1;
      min-width: 0;
      margin: 0;
      padding: 10px 12px;
      border-radius: 8px;
      overflow-x: auto;
      background: var(--mat-sys-surface-container-high);
      font:
        12px/1.5 ui-monospace,
        Consolas,
        monospace;
      white-space: pre;
    }
    .tokens {
      list-style: none;
      margin: 0;
      padding: 0;
      li {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 6px 0;
        border-bottom: 1px solid var(--mat-sys-outline-variant);
      }
    }
    .body {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .meta,
    .hint {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
  `,
})
export class McpSettingsComponent {
  private readonly api = accessTokensApi(inject(DASHBOARD_CLIENT).api);
  private readonly clipboard = inject(Clipboard);
  private readonly transloco = inject(TranslocoService);

  protected readonly info = httpResource<McpInfo>(() => CORE_READS.mcp());
  protected readonly clients: Client[] = [
    'claudeCode',
    'claudeDesktop',
    'cursor',
  ];
  protected readonly name = signal('');
  protected readonly scope = signal<AccessTokenScope>('read');
  protected readonly busy = signal(false);
  /** The token just made: shown in the lines once, until the page is left. */
  protected readonly created = signal<AccessTokenCreated | null>(null);
  private readonly token = computed(
    () => this.created()?.token ?? 'pd_YOUR_TOKEN',
  );

  /** The lines that connect a client, with the address and the token put in. */
  protected snippet(client: Client, url: string): string {
    const token = this.token();
    switch (client) {
      case 'claudeCode':
        return `claude mcp add --transport http personal-dashboard ${url} --header "Authorization: Bearer ${token}"`;
      case 'claudeDesktop':
        // Claude Desktop starts local servers only: mcp-remote carries the calls to this one.
        return JSON.stringify(
          {
            mcpServers: {
              'personal-dashboard': {
                command: 'npx',
                args: [
                  '-y',
                  'mcp-remote',
                  url,
                  '--header',
                  'Authorization:${AUTH}',
                ],
                env: {AUTH: `Bearer ${token}`},
              },
            },
          },
          null,
          2,
        );
      case 'cursor':
        return JSON.stringify(
          {
            mcpServers: {
              'personal-dashboard': {
                url,
                headers: {Authorization: `Bearer ${token}`},
              },
            },
          },
          null,
          2,
        );
    }
  }

  protected copy(text: string): void {
    this.clipboard.copy(text);
  }

  protected async create(): Promise<void> {
    this.busy.set(true);
    try {
      this.created.set(
        await this.api.create({name: this.name().trim(), scope: this.scope()}),
      );
      this.name.set('');
      this.info.reload();
    } finally {
      this.busy.set(false);
    }
  }

  protected async revoke(id: string): Promise<void> {
    if (!confirm(this.transloco.translate('core.settings.mcp.confirmRevoke'))) {
      return;
    }
    await this.api.revoke(id);
    if (this.created()?.id === id) {
      this.created.set(null);
    }
    this.info.reload();
  }
}
