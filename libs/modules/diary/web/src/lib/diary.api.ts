import { httpResource } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { DIARY_READS, diaryApi } from '@pd/client-core';
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
  LocalDate,
} from '@pd/contracts';
import { DASHBOARD_CLIENT, fromCore } from '@pd/web-core';

/**
 * The diary requests of the client core (`@pd/client-core`) for Angular: reads as reactive
 * `httpResource`s (re-fetched when their signals change), the rest as Observables.
 */
@Injectable({ providedIn: 'root' })
export class DiaryApi {
  private readonly diary = diaryApi(inject(DASHBOARD_CLIENT).api);

  entries(query: () => DiaryQuery) {
    return httpResource<DiaryEntry[]>(() => DIARY_READS.entries(query()), { defaultValue: [] });
  }

  /** The selected day's entry; `null` if it does not exist yet. */
  entry(day: () => LocalDate) {
    return httpResource<DiaryEntry | null>(() => DIARY_READS.entry(day()));
  }

  /** Full-text search; no request while the query is shorter than 2 characters. */
  search(query: () => string) {
    return httpResource<DiarySearchHit[]>(
      () => {
        const q = query().trim();
        return q.length >= 2 ? DIARY_READS.search(q) : undefined;
      },
      { defaultValue: [] },
    );
  }

  /** Fragments marked with an emoji; no request without an emoji. */
  marks(emoji: () => string | null) {
    return httpResource<DiaryMarkHit[]>(
      () => {
        const value = emoji();
        return value ? DIARY_READS.marks(value) : undefined;
      },
      { defaultValue: [] },
    );
  }

  calendar(year: () => number) {
    return httpResource<DiaryCalendarDay[]>(() => DIARY_READS.calendar(year()), {
      defaultValue: [],
    });
  }

  memories(day: () => LocalDate) {
    return httpResource<DiaryMemory[]>(() => DIARY_READS.memories(day()), { defaultValue: [] });
  }

  insights() {
    return httpResource<DiaryInsights>(() => DIARY_READS.insights());
  }

  stats() {
    return httpResource<DiaryStats>(() => DIARY_READS.stats());
  }

  settings() {
    return httpResource<DiarySettings>(() => DIARY_READS.settings());
  }

  photos(day: () => LocalDate) {
    return httpResource<DiaryPhoto[]>(() => DIARY_READS.photos(day()), { defaultValue: [] });
  }

  /** The image as a blob: `<img src>` cannot send the auth header, an object URL can be shown. */
  photoBlob(id: string) {
    return fromCore(() => this.diary.photo(id));
  }

  uploadPhoto(day: LocalDate, file: File) {
    return fromCore(() => this.diary.uploadPhoto(day, file));
  }

  removePhoto(id: string) {
    return fromCore(() => this.diary.removePhoto(id));
  }

  /** One entry, once (a command adding to it); pages follow it with `entry`. */
  loadEntry(day: LocalDate) {
    return fromCore(() => this.diary.entry(day));
  }

  save(day: LocalDate, input: DiaryEntryInput) {
    return fromCore(() => this.diary.save(day, input));
  }

  remove(day: LocalDate) {
    return fromCore(() => this.diary.remove(day));
  }

  /** Every entry and photo; the settings stay. */
  removeAll() {
    return fromCore(() => this.diary.removeAll());
  }

  summarize(period: { from: LocalDate; to: LocalDate }) {
    return fromCore(() => this.diary.summarize(period));
  }

  saveSettings(settings: DiarySettings) {
    return fromCore(() => this.diary.saveSettings(settings));
  }
}
