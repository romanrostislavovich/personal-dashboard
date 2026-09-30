import {
  DiaryCalendarDay,
  DiaryEntry,
  DiaryEntryInput,
  DiaryInsights,
  DiaryMarkHit,
  DiaryMemory,
  DiaryPhoto,
  DiaryQuery,
  DiarySearchHit,
  DiarySettings,
  DiaryStats,
  DiarySummary,
  LocalDate,
} from '@pd/contracts';
import { ApiClient, apiRequest } from '../api-client';

const BASE = '/api/diary';

/** Read requests of the diary (see ApiRequest). */
export const DIARY_READS = {
  entries: ({ from, to, tag }: DiaryQuery) => apiRequest(`${BASE}/entries`, { from, to, tag }),
  /** The day's entry; the server answers `null` if there is none. */
  entry: (day: LocalDate) => apiRequest(`${BASE}/entries/${day}`),
  search: (q: string) => apiRequest(`${BASE}/search`, { q }),
  marks: (emoji: string) => apiRequest(`${BASE}/marks`, { emoji }),
  calendar: (year: number) => apiRequest(`${BASE}/calendar`, { year }),
  memories: (day: LocalDate) => apiRequest(`${BASE}/memories/${day}`),
  insights: () => apiRequest(`${BASE}/insights`),
  stats: () => apiRequest(`${BASE}/stats`),
  settings: () => apiRequest(`${BASE}/settings`),
  photos: (day: LocalDate) => apiRequest(`${BASE}/entries/${day}/photos`),
};

/** A diary photo; it needs the auth header, so it is loaded with `DiaryApi.photo`. */
export function diaryPhotoPath(id: string): string {
  return `${BASE}/photos/${id}`;
}

export function diaryApi(api: ApiClient) {
  return {
    entries: (query: DiaryQuery) => api.read<DiaryEntry[]>(DIARY_READS.entries(query)),
    entry: (day: LocalDate) => api.read<DiaryEntry | null>(DIARY_READS.entry(day)),
    search: (q: string) => api.read<DiarySearchHit[]>(DIARY_READS.search(q)),
    marks: (emoji: string) => api.read<DiaryMarkHit[]>(DIARY_READS.marks(emoji)),
    calendar: (year: number) => api.read<DiaryCalendarDay[]>(DIARY_READS.calendar(year)),
    memories: (day: LocalDate) => api.read<DiaryMemory[]>(DIARY_READS.memories(day)),
    insights: () => api.read<DiaryInsights>(DIARY_READS.insights()),
    stats: () => api.read<DiaryStats>(DIARY_READS.stats()),
    settings: () => api.read<DiarySettings>(DIARY_READS.settings()),
    photos: (day: LocalDate) => api.read<DiaryPhoto[]>(DIARY_READS.photos(day)),

    save: (day: LocalDate, input: DiaryEntryInput) =>
      api.put<DiaryEntry | null>(`${BASE}/entries/${day}`, input),
    remove: (day: LocalDate) => api.delete(`${BASE}/entries/${day}`),
    /** Every entry and photo; the settings stay. */
    removeAll: () => api.delete(BASE),
    summarize: (period: { from: LocalDate; to: LocalDate }) =>
      api.post<DiarySummary>(`${BASE}/summary`, period),
    saveSettings: (settings: DiarySettings) => api.put<DiarySettings>(`${BASE}/settings`, settings),

    /** The image bytes, for an object URL (`<img src>` cannot send the auth header). */
    photo: (id: string) => api.blob(diaryPhotoPath(id)),
    uploadPhoto: (day: LocalDate, file: Blob) => {
      const form = new FormData();
      form.append('file', file);
      return api.post<DiaryPhoto>(`${BASE}/entries/${day}/photos`, form);
    },
    removePhoto: (id: string) => api.delete(diaryPhotoPath(id)),
  };
}

export type DiaryClient = ReturnType<typeof diaryApi>;
