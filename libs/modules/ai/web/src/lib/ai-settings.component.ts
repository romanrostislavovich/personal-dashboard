import {DatePipe} from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatCardModule} from '@angular/material/card';
import {MatCheckboxModule} from '@angular/material/checkbox';
import {MatDialog} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatSlideToggleModule} from '@angular/material/slide-toggle';
import {MatTooltipModule} from '@angular/material/tooltip';
import {TranslocoPipe, TranslocoService} from '@jsverse/transloco';
import {AiAction, AiConnection, AiPreferences, AiSettings} from '@pd/contracts';
import {errorStatus, IntegrationGuideComponent} from '@pd/web-core';
import {firstValueFrom} from 'rxjs';
import {AiApi} from './ai.api';
import {AiConnectionFormDialog} from './ai-connection-form.dialog';
import {AiModuleAccessComponent} from './ai-module-access.component';
import {AiKnowledgeComponent} from './ai-knowledge.component';

/**
 * Saved AI connections — one of them active, switched in one click (say, when a balance runs
 * out) — the morning digest and which connection understands Telegram voice messages.
 */
@Component({
  selector: 'pd-ai-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AiModuleAccessComponent,
    AiKnowledgeComponent,
    DatePipe,
    MatCardModule,
    IntegrationGuideComponent,
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
  templateUrl: './ai-settings.component.html',
  styleUrl: './ai-settings.component.scss',
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
  protected readonly namedModules = computed(() =>
    this.modules().map(id => ({id, name: this.moduleName(id)})),
  );
  /** Optional digest sections that modules offer (`development.streak`). */
  protected readonly digestOptions = signal<string[]>([]);
  /** The assistant's changes; `null` until asked for. */
  protected readonly actions = signal<AiAction[] | null>(null);
  /** The change being undone now, and why the last undo did not happen. */
  protected readonly undoing = signal<string | null>(null);
  protected readonly undoError = signal<{id: string; text: string} | null>(
    null,
  );

  constructor() {
    firstValueFrom(this.api.modules()).then(
      modules => this.modules.set(modules),
      () => this.modules.set([]),
    );
    firstValueFrom(this.api.digestOptions()).then(
      options => this.digestOptions.set(options),
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
    const others = this.settings().digestOptIns.filter(id => id !== option);
    await this.savePreferences({
      digestOptIns: enabled ? [...others, option] : others,
    });
  }

  async loadActions(): Promise<void> {
    this.actions.set(await firstValueFrom(this.api.actions()));
  }

  /** Puts back what one change of the assistant did; a change made again since is kept. */
  async undo(action: AiAction): Promise<void> {
    this.undoing.set(action.id);
    this.undoError.set(null);
    try {
      await firstValueFrom(this.api.undoAction(action.id));
      await this.loadActions();
    } catch (error) {
      const key =
        errorStatus(error) === 409
          ? 'ai.log.undoConflict'
          : 'ai.log.undoFailed';
      this.undoError.set({id: action.id, text: this.transloco.translate(key)});
    } finally {
      this.undoing.set(null);
    }
  }

  /** 1.2k, 3.4M: the tokens of a period at a glance. */
  protected tokens(count: number): string {
    return new Intl.NumberFormat(this.transloco.getActiveLang(), {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(count);
  }

  protected money(usd: number): string {
    return new Intl.NumberFormat(this.transloco.getActiveLang(), {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: usd < 1 ? 3 : 2,
    }).format(usd);
  }

  /** How much of the prompt this month came from the provider's cache. */
  protected cachedPercent({usage}: AiConnection): number {
    return Math.round(
      (usage.month.cachedTokens / Math.max(1, usage.month.promptTokens)) * 100,
    );
  }

  protected overLimit(connection: AiConnection): boolean {
    const cost = connection.usage.month.cost;
    return (
      connection.monthlyLimit !== null &&
      cost !== null &&
      cost >= connection.monthlyLimit
    );
  }

  async edit(connection: AiConnection | null): Promise<void> {
    const settings = await firstValueFrom(
      this.dialog
        .open<AiConnectionFormDialog, AiConnection | null, AiSettings>(
          AiConnectionFormDialog,
          {
            data: connection,
          },
        )
        .afterClosed(),
    );
    if (settings) {
      this.changed.emit(settings);
    }
  }

  async activate(connection: AiConnection): Promise<void> {
    this.changed.emit(
      await firstValueFrom(this.api.activateConnection(connection.id)),
    );
  }

  async remove(connection: AiConnection): Promise<void> {
    if (
      confirm(
        this.transloco.translate('ai.connections.confirmDelete', {
          name: connection.name,
        }),
      )
    ) {
      this.changed.emit(
        await firstValueFrom(this.api.removeConnection(connection.id)),
      );
    }
  }

  async setMorningDigest(morningDigest: boolean): Promise<void> {
    await this.savePreferences({morningDigest});
  }

  /** An emptied field keeps the saved time. */
  async saveDigestTime(time: string): Promise<void> {
    if (time) {
      await this.savePreferences({morningDigestTime: time});
    }
  }

  async saveSpeechModel(model: string): Promise<void> {
    if (model.trim()) {
      await this.savePreferences({speechModel: model.trim()});
    }
  }

  async saveVisionModel(model: string): Promise<void> {
    if (model.trim()) {
      await this.savePreferences({visionModel: model.trim()});
    }
  }

  async savePreferences(preferences: AiPreferences): Promise<void> {
    this.changed.emit(
      await firstValueFrom(this.api.savePreferences(preferences)),
    );
  }
}
