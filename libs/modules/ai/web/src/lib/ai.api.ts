import { HttpClient, httpResource } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  AiAttachmentUpload,
  AiChatRequest,
  AiChatResponse,
  AiConnectionInput,
  AiConversation,
  AiConversationDetail,
  AiPreferences,
  AiSettings,
} from '@pd/contracts';

/** The AI gateway lives in the core (`/api/ai`); modules add tools to it. */
@Injectable({ providedIn: 'root' })
export class AiApi {
  private readonly http = inject(HttpClient);

  settings() {
    return httpResource<AiSettings>(() => '/api/ai/settings');
  }

  savePreferences(preferences: AiPreferences) {
    return this.http.put<AiSettings>('/api/ai/preferences', preferences);
  }

  /** The connection is checked with a short request before it is saved. */
  saveConnection(input: AiConnectionInput, id?: string) {
    return id
      ? this.http.put<AiSettings>(`/api/ai/connections/${id}`, input)
      : this.http.post<AiSettings>('/api/ai/connections', input);
  }

  removeConnection(id: string) {
    return this.http.delete<AiSettings>(`/api/ai/connections/${id}`);
  }

  activateConnection(id: string) {
    return this.http.post<AiSettings>(`/api/ai/connections/${id}/activate`, {});
  }

  /** One message; the server keeps the conversation (shared with Telegram). */
  chat(request: AiChatRequest) {
    return this.http.post<AiChatResponse>('/api/ai/chat', request);
  }

  currentConversation() {
    return this.http.get<AiConversationDetail | null>('/api/ai/conversations/current');
  }

  conversation(id: string) {
    return this.http.get<AiConversationDetail>(`/api/ai/conversations/${id}`);
  }

  conversations() {
    return this.http.get<AiConversation[]>('/api/ai/conversations');
  }

  startConversation() {
    return this.http.post<AiConversationDetail>('/api/ai/conversations', {});
  }

  removeConversation(id: string) {
    return this.http.delete<void>(`/api/ai/conversations/${id}`);
  }

  /** The server returns the file text; it goes back with the next chat message. */
  uploadAttachment(file: File) {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<AiAttachmentUpload>('/api/ai/attachments', form);
  }
}
