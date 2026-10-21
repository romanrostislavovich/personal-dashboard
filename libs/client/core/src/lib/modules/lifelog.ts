import { LifelogNarrative, LifelogNote, LifelogQuery, LifelogSettings } from '@pd/contracts';
import { ApiClient, apiRequest } from '../api-client';

export const LIFELOG_READS = {
  settings: apiRequest('/api/life/narratives/settings'),
  list: (query: LifelogQuery) => apiRequest('/api/life/narratives', query),
  day: (day: string) => apiRequest(`/api/life/narratives/${encodeURIComponent(day)}`),
};

export function lifelogApi(api: ApiClient) {
  return {
    settings: () => api.read<LifelogSettings>(LIFELOG_READS.settings),
    configure: (input: LifelogSettings) =>
      api.put<LifelogSettings>('/api/life/narratives/settings', input),
    generate: (day: string) =>
      api.post<LifelogNarrative | null>(
        `/api/life/narratives/${encodeURIComponent(day)}/generate`,
        {},
      ),
    list: (query: LifelogQuery) => api.read<LifelogNarrative[]>(LIFELOG_READS.list(query)),
    day: (day: string) => api.read<LifelogNarrative | null>(LIFELOG_READS.day(day)),
    note: (day: string, input: LifelogNote) =>
      api.put<LifelogNarrative>(`/api/life/narratives/${encodeURIComponent(day)}/note`, input),
    remove: (day: string) => api.delete<void>(`/api/life/narratives/${encodeURIComponent(day)}`),
  };
}
