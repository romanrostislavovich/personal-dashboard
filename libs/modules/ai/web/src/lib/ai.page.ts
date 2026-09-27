import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AiChatMessage } from '@pd/contracts';
import { MarkdownPipe } from '@pd/web-core';
import { firstValueFrom } from 'rxjs';
import { AiApi } from './ai.api';
import { AiSettingsComponent } from './ai-settings.component';

interface ChatEntry extends AiChatMessage {
  /** Which modules the model took data from (answers only). */
  toolsUsed?: string[];
  isError?: boolean;
}

/** History lives while the tab is open; the server stores nothing. */
const HISTORY_KEY = 'pd.ai.history';
const SUGGESTION_KEYS = ['birthdays', 'spending', 'sites', 'diary', 'music'];

@Component({
  selector: 'pd-ai-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatButtonModule,
    MatChipsModule,
    MatIconModule,
    MatProgressBarModule,
    TranslocoPipe,
    MarkdownPipe,
    AiSettingsComponent,
  ],
  templateUrl: './ai.page.html',
  styleUrl: './ai.page.scss',
})
export class AiPage {
  private readonly api = inject(AiApi);
  private readonly transloco = inject(TranslocoService);
  private readonly messagesEnd = viewChild<ElementRef<HTMLElement>>('messagesEnd');

  protected readonly settings = this.api.settings();
  protected readonly suggestions = SUGGESTION_KEYS;
  protected readonly history = signal<ChatEntry[]>(loadHistory());
  protected readonly draft = signal('');
  protected readonly thinking = signal(false);
  protected readonly showSettings = signal(false);

  constructor() {
    // A question from the home widget: /ai?q=...
    const question = inject(ActivatedRoute).snapshot.queryParamMap.get('q');
    if (question) {
      // Remove the question from the URL so a page reload does not send it again.
      inject(Router).navigate([], { queryParams: {}, replaceUrl: true });
      void this.send(question);
    }
  }

  /** Source caption: "Diary", "Finance"… — module names from their translations. */
  protected sourceKey(module: string): string {
    return module === 'projects' ? 'core.nav.projects' : `${module}.title`;
  }

  async send(text = this.draft()): Promise<void> {
    const question = text.trim();
    if (!question || this.thinking()) {
      return;
    }
    this.draft.set('');
    this.update([...this.history(), { role: 'user', content: question }]);
    this.thinking.set(true);
    try {
      // Only the role and text are sent to the model, no internal fields.
      const messages = this.history()
        .filter((m) => !m.isError)
        .map(({ role, content }) => ({ role, content }));
      const { reply, toolsUsed } = await firstValueFrom(this.api.chat(messages));
      this.update([...this.history(), { role: 'assistant', content: reply, toolsUsed }]);
    } catch (error) {
      const key =
        error instanceof HttpErrorResponse && error.status === 400
          ? 'ai.errors.api'
          : 'ai.errors.generic';
      this.update([
        ...this.history(),
        { role: 'assistant', content: this.transloco.translate(key), isError: true },
      ]);
    } finally {
      this.thinking.set(false);
    }
  }

  askSuggestion(key: string): Promise<void> {
    return this.send(this.transloco.translate(`ai.suggestions.${key}`));
  }

  /** Enter sends, Shift+Enter adds a new line. */
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void this.send();
    }
  }

  clear(): void {
    this.update([]);
  }

  private update(history: ChatEntry[]): void {
    this.history.set(history);
    try {
      sessionStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch {
      // Storage is unavailable (private mode) — the history just won't survive a reload.
    }
    setTimeout(() => this.messagesEnd()?.nativeElement.scrollIntoView({ behavior: 'smooth' }));
  }
}

function loadHistory(): ChatEntry[] {
  try {
    return JSON.parse(sessionStorage.getItem(HISTORY_KEY) ?? '[]') as ChatEntry[];
  } catch {
    return [];
  }
}
