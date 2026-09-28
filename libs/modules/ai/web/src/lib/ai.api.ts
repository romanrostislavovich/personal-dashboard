import { HttpClient, httpResource } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  AiAttachmentUpload,
  AiChatMessage,
  AiChatResponse,
  AiSettings,
  AiSettingsInput,
} from '@pd/contracts';

/** The AI gateway lives in the core (`/api/ai`); modules add tools to it. */
@Injectable({ providedIn: 'root' })
export class AiApi {
  private readonly http = inject(HttpClient);

  settings() {
    return httpResource<AiSettings>(() => '/api/ai/settings');
  }

  saveSettings(input: AiSettingsInput) {
    return this.http.put<AiSettings>('/api/ai/settings', input);
  }

  removeSettings() {
    return this.http.delete<void>('/api/ai/settings');
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
