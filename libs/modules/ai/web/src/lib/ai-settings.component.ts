import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AiAction, AiConnection, AiPreferences, AiSettings } from '@pd/contracts';
import { firstValueFrom } from 'rxjs';
import { AiApi } from './ai.api';
import { AiConnectionFormDialog } from './ai-connection-form.dialog';

/**
 * Saved AI connections — one of them active, switched in one click (say, when a balance runs
 * out) — the morning digest and which connection understands Telegram voice messages.
 */
@Component({
  selector: 'pd-ai-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    MatCardModule,
    MatCheckboxModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatTooltipModule,
    TranslocoPipe,
  ],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-card-title>{{ 'ai.settings.title' | transloco }}</mat-card-title>
        <mat-card-subtitle>{{ 'ai.settings.privacy' | transloco }}</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        <h3 class="section">{{ 'ai.connections.title' | transloco }}</h3>
        @for (c of settings().connections; track c.id) {
          <div class="connection" [class.active]="c.id === settings().activeConnectionId">
            <mat-icon class="state">
              {{
                c.id === settings().activeConnectionId
                  ? 'radio_button_checked'
                  : 'radio_button_unchecked'
              }}
            </mat-icon>
            <span class="text">
              <span class="name">{{ c.name }}</span>
              <span class="details"
                >{{ 'ai.settings.providers.' + c.provider | transloco }} · {{ c.model }}</span
              >
            </span>
            @if (c.id === settings().activeConnectionId) {
              <span class="badge">{{ 'ai.connections.active' | transloco }}</span>
            } @else {
              <button matButton (click)="activate(c)">
                {{ 'ai.connections.use' | transloco }}
              </button>
            }
            <button matIconButton (click)="edit(c)" [matTooltip]="'core.actions.edit' | transloco">
              <mat-icon>edit</mat-icon>
            </button>
            <button
              matIconButton
              (click)="remove(c)"
              [matTooltip]="'core.actions.delete' | transloco"
            >
              <mat-icon>delete</mat-icon>
            </button>
          </div>
        } @empty {
          <p class="empty">{{ 'ai.connections.empty' | transloco }}</p>
        }
        <button matButton="tonal" class="add" (click)="edit(null)">
          <mat-icon>add</mat-icon> {{ 'ai.connections.add' | transloco }}
        </button>

        @if (settings().configured) {
          <mat-slide-toggle
            class="digest"
            [checked]="settings().morningDigest"
            (change)="setMorningDigest($event.checked)"
          >
            {{ 'ai.settings.morningDigest' | transloco }}
          </mat-slide-toggle>
          @if (digestOptions().length) {
            <div class="digest-options">
              @for (option of digestOptions(); track option) {
                <mat-checkbox
                  [checked]="settings().digestOptIns.includes(option)"
                  [disabled]="!settings().morningDigest"
                  (change)="setDigestOption(option, $event.checked)"
                >
                  {{ digestOptionName(option) }}
                </mat-checkbox>
              }
            </div>
          }

          <h3 class="section">🎤 {{ 'ai.speech.title' | transloco }}</h3>
          <p class="hint">{{ 'ai.speech.hint' | transloco }}</p>
          <div class="speech">
            <mat-form-field subscriptSizing="dynamic">
              <mat-label>{{ 'ai.speech.connection' | transloco }}</mat-label>
              <mat-select
                [value]="settings().speechConnectionId"
                (selectionChange)="savePreferences({ speechConnectionId: $event.value })"
              >
                <mat-option [value]="null">{{ 'ai.speech.auto' | transloco }}</mat-option>
                @for (c of settings().connections; track c.id) {
                  <mat-option [value]="c.id">{{ c.name }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <mat-form-field subscriptSizing="dynamic">
              <mat-label>{{ 'ai.settings.model' | transloco }}</mat-label>
              <input
                matInput
                [value]="settings().speechModel"
                (change)="saveSpeechModel($any($event.target).value)"
              />
            </mat-form-field>
          </div>

          <h3 class="section">👁️ {{ 'ai.privacy.title' | transloco }}</h3>
          <p class="hint">{{ 'ai.privacy.hint' | transloco }}</p>
          <div class="modules">
            @for (module of modules(); track module) {
              <mat-slide-toggle
                [checked]="!settings().disabledModules.includes(module)"
                (change)="setVisible(module, $event.checked)"
              >
                {{ moduleName(module) }}
              </mat-slide-toggle>
            }
          </div>

          <h3 class="section">📜 {{ 'ai.log.title' | transloco }}</h3>
          @if (actions(); as list) {
            @for (action of list; track action.id) {
              <div class="action" [class.failed]="action.outcome === 'failed'">
                <span class="action-time">{{ action.createdAt | date: 'd MMM, HH:mm' }}</span>
                <span class="action-body">
                  <span>
                    {{ moduleName(action.module) }} · <code>{{ action.tool }}</code> ·
                    {{ 'ai.log.outcome.' + action.outcome | transloco }}
                  </span>
                  <code class="action-args">{{ action.args }}</code>
                  @if (action.error) {
                    <span class="action-error">{{ action.error }}</span>
                  }
                </span>
              </div>
            } @empty {
              <p class="hint">{{ 'ai.log.empty' | transloco }}</p>
            }
          } @else {
            <button matButton (click)="loadActions()">
              <mat-icon>history</mat-icon> {{ 'ai.log.show' | transloco }}
            </button>
          }
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    .modules {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 8px 16px;
    }
    .action {
      display: flex;
      gap: 12px;
      padding: 6px 0;
      border-bottom: 1px solid var(--pd-border);
      font: var(--mat-sys-body-small);
    }
    .action-time {
      flex-shrink: 0;
      width: 90px;
      color: var(--mat-sys-on-surface-variant);
    }
    .action-body {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .action-args {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--mat-sys-on-surface-variant);
    }
    .action-error,
    .action.failed {
      color: var(--mat-sys-error);
    }
    .hint {
      margin: 0 0 8px;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .speech {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }
    .speech mat-form-field {
      flex: 1 1 220px;
    }
    .section {
      margin: 8px 0;
      font: var(--mat-sys-title-small);
    }
    .connection {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 4px 8px 12px;
      margin-bottom: 8px;
      border: 1px solid var(--pd-border);
      border-radius: var(--pd-radius-small);
    }
    .connection.active {
      border-color: var(--mat-sys-primary);
      background: color-mix(in srgb, var(--mat-sys-primary) 6%, transparent);
    }
    .state {
      color: var(--mat-sys-on-surface-variant);
    }
    .active .state {
      color: var(--mat-sys-primary);
    }
    .text {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .name {
      font: var(--mat-sys-title-small);
    }
    .details {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .badge {
      padding: 2px 10px;
      border-radius: 12px;
      font: var(--mat-sys-label-medium);
      background: var(--mat-sys-primary);
      color: var(--mat-sys-on-primary);
    }
    .add {
      margin-top: 4px;
    }
    .digest {
      display: block;
      margin-top: 20px;
    }
    .digest-options {
      display: flex;
      flex-direction: column;
      margin: 4px 0 0 44px;
    }
  `,
})
export class AiSettingsComponent {
  readonly settings = input.required<AiSettings>();
  /** New settings after any change: the page shows them without another request. */
  readonly changed = output<AiSettings>();

  private readonly api = inject(AiApi);
  private readonly dialog = inject(MatDialog);
  private readonly transloco = inject(TranslocoService);

  /** Modules that give the AI data. */
  protected readonly modules = signal<string[]>([]);
  /** Optional digest sections that modules offer (`development.streak`). */
  protected readonly digestOptions = signal<string[]>([]);
  /** The assistant's changes; `null` until asked for. */
  protected readonly actions = signal<AiAction[] | null>(null);

  constructor() {
    firstValueFrom(this.api.modules()).then(
      (modules) => this.modules.set(modules),
      () => this.modules.set([]),
    );
    firstValueFrom(this.api.digestOptions()).then(
      (options) => this.digestOptions.set(options),
      () => this.digestOptions.set([]),
    );
  }

  protected moduleName(module: string): string {
    const key = module === 'projects' ? 'core.nav.projects' : `${module}.title`;
    const name = this.transloco.translate(key);
    return name === key ? module : name;
  }

  /** The owning module names its option: `development.streak` → `development.digestOptions.streak`. */
  protected digestOptionName(option: string): string {
    const [module, ...rest] = option.split('.');
    const key = `${module}.digestOptions.${rest.join('.')}`;
    const name = this.transloco.translate(key);
    return name === key ? option : name;
  }

  async setDigestOption(option: string, enabled: boolean): Promise<void> {
    const others = this.settings().digestOptIns.filter((id) => id !== option);
    await this.savePreferences({ digestOptIns: enabled ? [...others, option] : others });
  }

  async setVisible(module: string, visible: boolean): Promise<void> {
    const others = this.settings().disabledModules.filter((m) => m !== module);
    await this.savePreferences({ disabledModules: visible ? others : [...others, module] });
  }

  async loadActions(): Promise<void> {
    this.actions.set(await firstValueFrom(this.api.actions()));
  }

  async edit(connection: AiConnection | null): Promise<void> {
    const settings = await firstValueFrom(
      this.dialog
        .open<AiConnectionFormDialog, AiConnection | null, AiSettings>(AiConnectionFormDialog, {
          data: connection,
        })
        .afterClosed(),
    );
    if (settings) {
      this.changed.emit(settings);
    }
  }

  async activate(connection: AiConnection): Promise<void> {
    this.changed.emit(await firstValueFrom(this.api.activateConnection(connection.id)));
  }

  async remove(connection: AiConnection): Promise<void> {
    if (
      confirm(this.transloco.translate('ai.connections.confirmDelete', { name: connection.name }))
    ) {
      this.changed.emit(await firstValueFrom(this.api.removeConnection(connection.id)));
    }
  }

  async setMorningDigest(morningDigest: boolean): Promise<void> {
    await this.savePreferences({ morningDigest });
  }

  async saveSpeechModel(model: string): Promise<void> {
    if (model.trim()) {
      await this.savePreferences({ speechModel: model.trim() });
    }
  }

  async savePreferences(preferences: AiPreferences): Promise<void> {
    this.changed.emit(await firstValueFrom(this.api.savePreferences(preferences)));
  }
}
