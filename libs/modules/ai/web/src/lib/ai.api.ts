import { HttpClient, httpResource } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  AiAttachmentUpload,
  AiChatMessage,
  AiChatResponse,
  AiConnectionInput,
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

  chat(messages: AiChatMessage[]) {
    return this.http.post<AiChatResponse>('/api/ai/chat', { messages });
  }

  /** The server returns the file text; it goes back with the next chat message. */
  uploadAttachment(file: File) {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<AiAttachmentUpload>('/api/ai/attachments', form);
  }
}
