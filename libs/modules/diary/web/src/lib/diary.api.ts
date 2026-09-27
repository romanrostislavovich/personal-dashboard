import { HttpClient, httpResource } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
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

const BASE = '/api/diary';

@Injectable({ providedIn: 'root' })
export class DiaryApi {
  private readonly http = inject(HttpClient);

  entries(query: () => DiaryQuery) {
    return httpResource<DiaryEntry[]>(
      () => {
        const { from, to, tag } = query();
        const params: Record<string, string> = tag ? { from, to, tag } : { from, to };
        return { url: `${BASE}/entries`, params };
      },
      { defaultValue: [] },
    );
  }

  /** The selected day's entry; `null` if it does not exist yet. */
  entry(day: () => LocalDate) {
    return httpResource<DiaryEntry | null>(() => `${BASE}/entries/${day()}`);
  }

  /** Full-text search; no request while the query is shorter than 2 characters. */
  search(query: () => string) {
    return httpResource<DiarySearchHit[]>(
      () => {
        const q = query().trim();
        return q.length >= 2 ? { url: `${BASE}/search`, params: { q } } : undefined;
      },
      { defaultValue: [] },
    );
  }

  /** Fragments marked with an emoji; no request without an emoji. */
  marks(emoji: () => string | null) {
    return httpResource<DiaryMarkHit[]>(
      () => {
        const value = emoji();
        return value ? { url: `${BASE}/marks`, params: { emoji: value } } : undefined;
      },
      { defaultValue: [] },
    );
  }

  calendar(year: () => number) {
    return httpResource<DiaryCalendarDay[]>(
      () => ({ url: `${BASE}/calendar`, params: { year: year() } }),
      { defaultValue: [] },
    );
  }

  memories(day: () => LocalDate) {
    return httpResource<DiaryMemory[]>(() => `${BASE}/memories/${day()}`, { defaultValue: [] });
  }

  insights() {
    return httpResource<DiaryInsights>(() => `${BASE}/insights`);
  }

  stats() {
    return httpResource<DiaryStats>(() => `${BASE}/stats`);
  }

  settings() {
    return httpResource<DiarySettings>(() => `${BASE}/settings`);
  }

  photos(day: () => LocalDate) {
    return httpResource<DiaryPhoto[]>(() => `${BASE}/entries/${day()}/photos`, {
      defaultValue: [],
    });
  }

  /** The image as a blob: `<img src>` cannot send the auth header, an object URL can be shown. */
  photoBlob(id: string) {
    return this.http.get(`${BASE}/photos/${id}`, { responseType: 'blob' });
  }

  uploadPhoto(day: LocalDate, file: File) {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<DiaryPhoto>(`${BASE}/entries/${day}/photos`, form);
  }

  removePhoto(id: string) {
    return this.http.delete<void>(`${BASE}/photos/${id}`);
  }

  save(day: LocalDate, input: DiaryEntryInput) {
    return this.http.put<DiaryEntry | null>(`${BASE}/entries/${day}`, input);
  }

  remove(day: LocalDate) {
    return this.http.delete<void>(`${BASE}/entries/${day}`);
  }

  summarize(period: { from: LocalDate; to: LocalDate }) {
    return this.http.post<DiarySummary>(`${BASE}/summary`, period);
  }

  saveSettings(settings: DiarySettings) {
    return this.http.put<DiarySettings>(`${BASE}/settings`, settings);
  }
}
