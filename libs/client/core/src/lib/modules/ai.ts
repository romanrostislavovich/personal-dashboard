import {
  AiAction,
  AiAttachmentUpload,
  AiChatRequest,
  AiChatResponse,
  AiConnectionInput,
  AiConversation,
  AiConversationDetail,
  AiPreferences,
  AiSettings,
} from '@pd/contracts';
import { ApiClient, apiRequest } from '../api-client';

const BASE = '/api/ai';

/** Read requests of the AI (see ApiRequest). */
export const AI_READS = {
  settings: () => apiRequest(`${BASE}/settings`),
};

/** The AI gateway lives in the core of the server; modules add tools to it. */
export function aiApi(api: ApiClient) {
  return {
    settings: () => api.read<AiSettings>(AI_READS.settings()),
    /** Only the fields sent change. */
    savePreferences: (preferences: AiPreferences) =>
      api.put<AiSettings>(`${BASE}/preferences`, preferences),
    /** The connection is checked with a short request before it is saved. */
    saveConnection: (input: AiConnectionInput, id?: string) =>
      id
        ? api.put<AiSettings>(`${BASE}/connections/${id}`, input)
        : api.post<AiSettings>(`${BASE}/connections`, input),
    removeConnection: (id: string) => api.delete<AiSettings>(`${BASE}/connections/${id}`),
    activateConnection: (id: string) =>
      api.post<AiSettings>(`${BASE}/connections/${id}/activate`, {}),
    /** Modules that give the AI data: the switches of "what the AI sees". */
    modules: () => api.get<string[]>(`${BASE}/modules`),
    /** What the assistant changed or tried to change, newest first. */
    actions: () => api.get<AiAction[]>(`${BASE}/actions`),

    /** One message; the server keeps the conversation (shared with Telegram). */
    chat: (request: AiChatRequest) => api.post<AiChatResponse>(`${BASE}/chat`, request),
    currentConversation: () =>
      api.get<AiConversationDetail | null>(`${BASE}/conversations/current`),
    conversation: (id: string) => api.get<AiConversationDetail>(`${BASE}/conversations/${id}`),
    conversations: () => api.get<AiConversation[]>(`${BASE}/conversations`),
    startConversation: () => api.post<AiConversationDetail>(`${BASE}/conversations`, {}),
    removeConversation: (id: string) => api.delete(`${BASE}/conversations/${id}`),

    /** The server reads the file's text; it goes back with the next chat message. */
    uploadAttachment: (file: Blob, fileName?: string) => {
      const form = new FormData();
      form.append('file', file, fileName);
      return api.post<AiAttachmentUpload>(`${BASE}/attachments`, form);
    },
  };
}

export type AiClient = ReturnType<typeof aiApi>;
