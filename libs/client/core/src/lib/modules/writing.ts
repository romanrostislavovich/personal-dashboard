import {
  WritingCheck,
  WritingCheckResult,
  WritingConfig,
  WritingIgnore,
  WritingRewrite,
  WritingRewriteInput,
  WritingSettingsUpdate,
} from '@pd/contracts';
import { ApiClient, apiRequest } from '../api-client';

const BASE = '/api/writing';

export const WRITING_READS = {
  /** The settings with the dictionary, and whether the server can check and rewrite. */
  settings: () => apiRequest(`${BASE}/settings`),
};

/** Writing: the check as one types and the AI's rewrites (the page, the extension, the app). */
export function writingApi(api: ApiClient) {
  return {
    settings: () => api.read<WritingConfig>(WRITING_READS.settings()),
    /** Only the fields sent change. */
    saveSettings: (update: WritingSettingsUpdate) =>
      api.put<WritingConfig>(`${BASE}/settings`, update),
    /** A word into the dictionary, or a rule switched off. */
    ignore: (what: WritingIgnore) => api.post<WritingConfig>(`${BASE}/ignore`, what),
    check: (input: WritingCheck) => api.post<WritingCheckResult>(`${BASE}/check`, input),
    rewrite: (input: WritingRewriteInput) => api.post<WritingRewrite>(`${BASE}/rewrite`, input),
  };
}

export type WritingClient = ReturnType<typeof writingApi>;
