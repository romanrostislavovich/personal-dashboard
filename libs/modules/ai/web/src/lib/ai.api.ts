import { httpResource } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { AI_READS, aiApi } from '@pd/client-core';
import { AiChatRequest, AiConnectionInput, AiPreferences, AiSettings } from '@pd/contracts';
import { DASHBOARD_CLIENT, fromCore } from '@pd/web-core';

/**
 * The AI requests of the client core (`@pd/client-core`) for Angular: reads as `httpResource`,
 * the rest as Observables. The AI gateway lives in the server core; modules add tools to it.
 */
@Injectable({ providedIn: 'root' })
export class AiApi {
  private readonly ai = aiApi(inject(DASHBOARD_CLIENT).api);

  settings() {
    return httpResource<AiSettings>(() => AI_READS.settings());
  }

  savePreferences(preferences: AiPreferences) {
    return fromCore(() => this.ai.savePreferences(preferences));
  }

  /** The connection is checked with a short request before it is saved. */
  saveConnection(input: AiConnectionInput, id?: string) {
    return fromCore(() => this.ai.saveConnection(input, id));
  }

  removeConnection(id: string) {
    return fromCore(() => this.ai.removeConnection(id));
  }

  activateConnection(id: string) {
    return fromCore(() => this.ai.activateConnection(id));
  }

  /** One message; the server keeps the conversation (shared with Telegram). */
  chat(request: AiChatRequest) {
    return fromCore(() => this.ai.chat(request));
  }

  currentConversation() {
    return fromCore(() => this.ai.currentConversation());
  }

  conversation(id: string) {
    return fromCore(() => this.ai.conversation(id));
  }

  conversations() {
    return fromCore(() => this.ai.conversations());
  }

  startConversation() {
    return fromCore(() => this.ai.startConversation());
  }

  removeConversation(id: string) {
    return fromCore(() => this.ai.removeConversation(id));
  }

  /** The server returns the file text; it goes back with the next chat message. */
  uploadAttachment(file: File) {
    return fromCore(() => this.ai.uploadAttachment(file, file.name));
  }
}
