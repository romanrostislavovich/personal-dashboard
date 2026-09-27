import { HttpClient, httpResource } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { AiChatMessage, AiChatResponse, AiSettings, AiSettingsInput } from '@pd/contracts';

/** AI-шлюз живёт в ядре (`/api/ai`); модули добавляют ему инструменты. */
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
}
