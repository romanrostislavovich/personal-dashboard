import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AiMemory, AiPreferences, AiSettings } from '@pd/contracts';
import { errorStatus } from '@pd/web-core';
import { firstValueFrom } from 'rxjs';
import { AiApi } from './ai.api';

/**
 * What the assistant knows besides the sections: the facts it was asked to remember, and the
 * index of search by meaning over the history (which connection makes its vectors, how many
 * items it holds).
 */
@Component({
  selector: 'pd-ai-knowledge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    TranslocoPipe,
  ],
  template: `
    <h3 class="section">🧠 {{ 'ai.memory.title' | transloco }}</h3>
    <p class="hint">{{ 'ai.memory.hint' | transloco }}</p>
    @for (memory of memories(); track memory.id) {
      <div class="memory">
        <span>{{ memory.text }}</span>
        <button
          matIconButton
          [attr.aria-label]="'ai.memory.forget' | transloco"
          (click)="forget(memory)"
        >
          <mat-icon>delete</mat-icon>
        </button>
      </div>
    } @empty {
      <p class="hint">{{ 'ai.memory.empty' | transloco }}</p>
    }
    <form class="add" (submit)="$event.preventDefault(); remember()">
      <mat-form-field subscriptSizing="dynamic">
        <mat-label>{{ 'ai.memory.add' | transloco }}</mat-label>
        <input
          matInput
          maxlength="500"
          [ngModel]="draft()"
          (ngModelChange)="draft.set($event)"
          name="fact"
        />
      </mat-form-field>
      <button matButton="tonal" type="submit" [disabled]="!draft().trim()">
        {{ 'ai.memory.remember' | transloco }}
      </button>
    </form>

    <h3 class="section">🔎 {{ 'ai.recall.title' | transloco }}</h3>
    <p class="hint">{{ 'ai.recall.hint' | transloco }}</p>
    <div class="row">
      <mat-form-field subscriptSizing="dynamic">
        <mat-label>{{ 'ai.speech.connection' | transloco }}</mat-label>
        <mat-select
          [value]="settings().embeddingConnectionId"
          (selectionChange)="save.emit({ embeddingConnectionId: $event.value })"
        >
          <mat-option [value]="null">{{ 'ai.recall.auto' | transloco }}</mat-option>
          @for (c of settings().connections; track c.id) {
            <mat-option [value]="c.id">{{ c.name }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field subscriptSizing="dynamic">
        <mat-label>{{ 'ai.settings.model' | transloco }}</mat-label>
        <input
          matInput
          [value]="settings().embeddingModel"
          (change)="saveModel($any($event.target).value)"
        />
      </mat-form-field>
    </div>
    <div class="row status">
      <span>{{ status() }}</span>
      <button matButton [disabled]="indexing()" (click)="reindex()">
        <mat-icon>refresh</mat-icon> {{ 'ai.recall.reindex' | transloco }}
      </button>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .memory {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 2px 0;
      border-bottom: 1px solid var(--pd-border);
    }
    .add,
    .row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 12px;
      margin-top: 8px;
    }
    .add mat-form-field {
      flex: 1 1 280px;
    }
    .status {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class AiKnowledgeComponent {
  readonly settings = input.required<AiSettings>();
  readonly save = output<AiPreferences>();

  private readonly api = inject(AiApi);

  protected readonly memories = signal<AiMemory[]>([]);
  protected readonly draft = signal('');
  protected readonly indexed = signal<number | null>(null);
  protected readonly indexing = signal(false);
  /** Why the index could not be built (no connection makes vectors). */
  protected readonly indexError = signal<string | null>(null);
  protected readonly status = computed(() => {
    const error = this.indexError();
    const count = this.indexed();
    if (error) {
      return this.transloco.translate(`ai.recall.${error}`);
    }
    return count === null ? '' : this.transloco.translate('ai.recall.indexed', { count });
  });

  private readonly transloco = inject(TranslocoService);

  constructor() {
    void this.load();
  }

  async remember(): Promise<void> {
    const text = this.draft().trim();
    if (text) {
      await firstValueFrom(this.api.addMemory(text));
      this.draft.set('');
      await this.load();
    }
  }

  async forget(memory: AiMemory): Promise<void> {
    await firstValueFrom(this.api.removeMemory(memory.id));
    await this.load();
  }

  saveModel(model: string): void {
    if (model.trim()) {
      this.save.emit({ embeddingModel: model.trim() });
    }
  }

  async reindex(): Promise<void> {
    this.indexing.set(true);
    this.indexError.set(null);
    try {
      this.indexed.set((await firstValueFrom(this.api.recallIndex())).indexed);
    } catch (error) {
      this.indexError.set(errorStatus(error) === 400 ? 'no-connection' : 'failed');
    } finally {
      this.indexing.set(false);
    }
  }

  private async load(): Promise<void> {
    this.memories.set(await firstValueFrom(this.api.memories()).catch(() => []));
    this.indexed.set(
      await firstValueFrom(this.api.recallStatus()).then(
        (status) => status.indexed,
        () => null,
      ),
    );
  }
}
