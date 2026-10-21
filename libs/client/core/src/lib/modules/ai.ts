import {
  AI_IMAGE_TYPES,
  AiAction,
  AiAttachmentUpload,
  AiMemory,
  AiRecallHit,
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
    /** Optional sections of the morning digest: ids like `development.streak`. */
    digestOptions: () => api.get<string[]>(`${BASE}/digest-options`),
    /** What the assistant changed or tried to change, newest first. */
    actions: () => api.get<AiAction[]>(`${BASE}/actions`),
    /** What the assistant keeps between conversations. */
    memories: () => api.get<AiMemory[]>(`${BASE}/memories`),
    addMemory: (text: string) => api.post<AiMemory>(`${BASE}/memories`, { text }),
    removeMemory: (id: string) => api.delete(`${BASE}/memories/${id}`),

    /** Search by meaning over the user's history; 400 — no connection makes vectors. */
    recall: (question: string, module?: string) =>
      api.get<AiRecallHit[]>(
        `${BASE}/recall?q=${encodeURIComponent(question)}${module ? `&module=${encodeURIComponent(module)}` : ''}`,
      ),
    recallStatus: () => api.get<{ indexed: number }>(`${BASE}/recall/status`),
    /** Brings the index up to date now (it is also done every hour). */
    recallIndex: () => api.post<{ indexed: number }>(`${BASE}/recall/index`, {}),

    /** Puts back what one change of the assistant did; 409 — changed again since. */
    undoAction: (id: string) => api.post<void>(`${BASE}/actions/${id}/undo`, {}),

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

/**
 * The files of a paste (Ctrl+V) to attach to a chat message: a screenshot, a copied picture or
 * files copied in the file manager. A paste that carries text (a copy from Word or Excel also
 * brings a picture of it) stays a text paste: then nothing is returned. A picture from the
 * clipboard is named "image.png" by every browser, so it gets the time it was pasted.
 */
export function pastedFiles(clipboard: DataTransfer | null, now = new Date()): File[] {
  if (!clipboard || clipboard.getData('text/plain')) {
    return [];
  }
  return [...clipboard.files].map((file, index) => {
    const extension = AI_IMAGE_TYPES[file.type];
    if (!extension || !/^image\.\w+$/i.test(file.name)) {
      return file;
    }
    const time = now.toTimeString().slice(0, 8).replace(/:/g, '-');
    const name = `image-${time}${index ? `-${index + 1}` : ''}${extension}`;
    return new File([file], name, { type: file.type });
  });
}
