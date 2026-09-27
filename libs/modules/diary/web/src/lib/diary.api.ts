import { HttpClient, httpResource } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  DiaryEntry,
  DiaryEntryInput,
  DiaryQuery,
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

  stats() {
    return httpResource<DiaryStats>(() => `${BASE}/stats`);
  }

  settings() {
    return httpResource<DiarySettings>(() => `${BASE}/settings`);
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
