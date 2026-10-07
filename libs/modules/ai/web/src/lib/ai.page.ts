import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import {
  AI_ATTACHMENT_EXTENSIONS,
  AI_ATTACHMENT_MAX_BYTES,
  AI_MAX_ATTACHMENTS,
  AiAttachment,
  AiConnection,
  AiConversation,
  AiConversationDetail,
} from '@pd/contracts';
import {
  desktopBridge,
  INTEGRATIONS_LINK,
  MarkdownPipe,
  errorBody,
  errorStatus,
} from '@pd/web-core';
import { firstValueFrom } from 'rxjs';
import { AiApi } from './ai.api';

interface ChatEntry {
  role: 'user' | 'assistant';
  content: string;
  /** Names of the files sent with the message. */
  attachments?: string[];
  /** Which modules the model took data from (answers only). */
  toolsUsed?: string[];
  /** Shown here only, never stored: a failed answer saves nothing on the server. */
  isError?: boolean;
}

const SUGGESTION_KEYS = ['birthdays', 'spending', 'sites', 'diary', 'music'];

@Component({
  selector: 'pd-ai-page',
  host: { '(click)': 'follow($event)' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    FormsModule,
    MatButtonModule,
    MatChipsModule,
    MatIconModule,
    MatMenuModule,
    MatProgressBarModule,
    TranslocoPipe,
    MarkdownPipe,
    RouterLink,
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
  /** The open conversation; it is stored on the server and shared with Telegram. */
  private readonly router = inject(Router);
  protected readonly conversationId = signal<string | null>(null);
  protected readonly history = signal<ChatEntry[]>([]);
  /** Earlier conversations, loaded when the menu opens. */
  protected readonly archive = signal<AiConversation[]>([]);
  protected readonly draft = signal('');
  protected readonly thinking = signal(false);
  /** Connections, privacy and the action log are in Settings → Integrations (ai.integration.ts). */
  protected readonly integrations = INTEGRATIONS_LINK;
  protected readonly activeConnection = computed(() => {
    const settings = this.settings.value();
    return settings?.connections.find((c) => c.id === settings.activeConnectionId) ?? null;
  });
  /** Files read by the server, waiting to be sent with the next message. */
  protected readonly attachments = signal<AiAttachment[]>([]);
  protected readonly uploading = signal(false);
  protected readonly attachError = signal<string | null>(null);
  protected readonly accept = AI_ATTACHMENT_EXTENSIONS.join(',');
  protected readonly maxAttachments = AI_MAX_ATTACHMENTS;

  constructor() {
    // A question from the home widget: /ai?q=...
    const question = inject(ActivatedRoute).snapshot.queryParamMap.get('q');
    if (question) {
      // Remove the question from the URL so a page reload does not send it again.
      inject(Router).navigate([], { queryParams: {}, replaceUrl: true });
    }
    // The question goes to the current conversation, so it waits until that is loaded.
    const loaded = this.loadCurrent().then(() => (question ? this.send(question) : undefined));
    // A bank statement the desktop app found in Downloads: /ai?statement=<id>, also while open.
    inject(ActivatedRoute)
      .queryParamMap.pipe(takeUntilDestroyed())
      .subscribe((params) => {
        const statement = params.get('statement');
        if (statement) {
          void this.router.navigate([], { queryParams: {}, replaceUrl: true });
          void loaded.then(() => this.importStatement(statement));
        }
      });
  }

  /** Attaches the statement and asks the AI to show what it found before recording it. */
  private async importStatement(id: string): Promise<void> {
    const file = await desktopBridge()?.downloads?.take(id);
    if (!file) {
      return;
    }
    const bytes = Uint8Array.from(atob(file.base64), (char) => char.charCodeAt(0));
    this.uploading.set(true);
    try {
      await this.readFile(new File([bytes], file.name));
    } finally {
      this.uploading.set(false);
    }
    if (this.attachments().length) {
      await this.send(this.transloco.translate('ai.importStatement', { name: file.name }));
    }
  }

  /** Source caption: "Diary", "Finance"… — module names from their translations. */
  protected sourceKey(module: string): string {
    return module === 'projects' ? 'core.nav.projects' : `${module}.title`;
  }

  async send(text = this.draft()): Promise<void> {
    const question = text.trim();
    const attachments = this.attachments();
    if (!this.canSend(question, attachments)) {
      return;
    }
    this.draft.set('');
    this.attachments.set([]);
    this.attachError.set(null);
    this.append({
      role: 'user',
      content: question,
      attachments: attachments.map((file) => file.name),
    });
    this.thinking.set(true);
    try {
      const { conversationId, reply, toolsUsed } = await firstValueFrom(
        this.api.chat({
          conversationId: this.conversationId() ?? undefined,
          content: question,
          ...(attachments.length ? { attachments } : {}),
        }),
      );
      this.conversationId.set(conversationId);
      this.append({ role: 'assistant', content: reply, toolsUsed });
    } catch (error) {
      const key = isProviderError(error) ? 'ai.errors.api' : 'ai.errors.generic';
      this.append({ role: 'assistant', content: this.transloco.translate(key), isError: true });
    } finally {
      this.thinking.set(false);
    }
  }

  /** The one-click switch from the chat header: the next answer comes from this connection. */
  async useConnection(connection: AiConnection): Promise<void> {
    this.settings.set(await firstValueFrom(this.api.activateConnection(connection.id)));
  }

  /** Reads the chosen files on the server; they are sent with the next message. */
  async attach(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = '';
    this.attachError.set(null);
    this.uploading.set(true);
    try {
      const room = AI_MAX_ATTACHMENTS - this.attachments().length;
      for (const file of files.slice(0, room)) {
        await this.readFile(file);
      }
    } finally {
      this.uploading.set(false);
    }
  }

  removeAttachment(index: number): void {
    this.attachments.update((list) => list.filter((_, i) => i !== index));
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

  /** A new conversation, here and in Telegram; the old one stays in the history menu. */
  async startNew(): Promise<void> {
    this.show(await firstValueFrom(this.api.startConversation()));
  }

  async loadArchive(): Promise<void> {
    this.archive.set(await firstValueFrom(this.api.conversations()));
  }

  /** Opens an earlier conversation; a new message continues it (and makes it current). */
  async open(conversation: AiConversation): Promise<void> {
    this.show(await firstValueFrom(this.api.conversation(conversation.id)));
  }

  async removeConversation(conversation: AiConversation, event: Event): Promise<void> {
    event.stopPropagation();
    await firstValueFrom(this.api.removeConversation(conversation.id));
    this.archive.update((list) => list.filter((c) => c.id !== conversation.id));
    if (conversation.id === this.conversationId()) {
      await this.loadCurrent();
    }
  }

  private async loadCurrent(): Promise<void> {
    try {
      this.show(await firstValueFrom(this.api.currentConversation()));
    } catch {
      // The chat still works: the first message starts a conversation.
    }
  }

  private show(conversation: AiConversationDetail | null): void {
    this.conversationId.set(conversation?.id ?? null);
    this.update(
      (conversation?.messages ?? []).map(({ role, content, attachments, toolsUsed }) => ({
        role,
        content,
        attachments,
        toolsUsed,
      })),
    );
  }

  private canSend(question: string, attachments: AiAttachment[]): boolean {
    const hasContent = Boolean(question) || attachments.length > 0;
    return hasContent && !this.thinking() && !this.uploading();
  }

  private async readFile(file: File): Promise<void> {
    if (file.size > AI_ATTACHMENT_MAX_BYTES) {
      this.attachError.set(this.transloco.translate('ai.attach.tooLarge', { name: file.name }));
      return;
    }
    try {
      const { name, text, truncated } = await firstValueFrom(this.api.uploadAttachment(file));
      this.attachments.update((list) => [...list, { name, text }]);
      if (truncated) {
        this.attachError.set(this.transloco.translate('ai.attach.truncated', { name }));
      }
    } catch (error) {
      this.attachError.set(this.transloco.translate(attachErrorKey(error), { name: file.name }));
    }
  }

  private append(entry: ChatEntry): void {
    this.update([...this.history(), entry]);
  }

  private update(history: ChatEntry[]): void {
    this.history.set(history);
    setTimeout(() => this.messagesEnd()?.nativeElement.scrollIntoView({ behavior: 'smooth' }));
  }

  /** A link of an answer to a day or a diary entry opens inside the app, not as a page load. */
  protected follow(event: MouseEvent): void {
    const href = (event.target as HTMLElement).closest('a')?.getAttribute('href');
    if (href?.startsWith('/')) {
      event.preventDefault();
      void this.router.navigateByUrl(href);
    }
  }
}

/** The provider rejected the request (a bad key, no balance): switching models may help. */
function isProviderError(error: unknown): boolean {
  return errorStatus(error) === 400;
}

/** The server says why a file could not be read (see AttachmentError). */
function attachErrorKey(error: unknown): string {
  if (errorStatus(error) === 413) {
    return 'ai.attach.tooLarge';
  }
  const reason = (errorBody(error) as { reason?: string } | null)?.reason;
  if (reason === 'unsupported' || reason === 'empty') {
    return `ai.attach.${reason}`;
  }
  return 'ai.attach.failed';
}
