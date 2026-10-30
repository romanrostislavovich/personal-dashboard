import {HttpClient} from '@angular/common/http';
import {
  ApiClient,
  ApiRequest,
  DIARY_READS,
  diaryApi,
  HABITS_READS,
  PSYCHOLOGY_READS,
  TASKS_READS,
} from '@pd/client-core';
import {
  addDays,
  DiaryPhoto,
  LocalDate,
  parseLocalDate,
  toLocalDate,
} from '@pd/contracts';
import {firstValueFrom} from 'rxjs';
import {
  currentMonth,
  monthRange,
  shiftMonth,
  todayLocalDate,
} from '../utils/month';

/** Months of the diary to have for reading on the way. */
const DIARY_MONTHS = 12;
/** Days whose entries open in the editor without a connection. */
const DIARY_DAYS = 31;
/** Reads sent at once: the phone stays usable while it goes. */
const PARALLEL = 4;

/** The days whose diary photos are there on a train: the latest month, as the editor's days. */
function recentDays(now: Date): LocalDate[] {
  const today = parseLocalDate(todayLocalDate(now));
  return Array.from({length: DIARY_DAYS}, (_, i) =>
    toLocalDate(addDays(today, -i)),
  );
}

/**
 * What the Android app reads ahead while it has a connection, so it is there on a train: the
 * diary of the last year (and the photos of its last month), tasks and reminders, habits, the
 * gentle day. Each read goes through HttpClient like the pages' own, with the same address and
 * parameters, so the read cache (offline-read.interceptor.ts) answers the page later. Sections
 * opened before are kept anyway.
 */
export function offlineReads(now = new Date()): ApiRequest[] {
  const today = todayLocalDate(now);
  const month = currentMonth(now);
  const months = Array.from({length: DIARY_MONTHS}, (_, i) =>
    DIARY_READS.entries(monthRange(shiftMonth(month, -i))),
  );
  const days = recentDays(now).flatMap(day => [
    DIARY_READS.entry(day),
    DIARY_READS.photos(day),
  ]);
  return [
    TASKS_READS.tasks(),
    TASKS_READS.lists(),
    TASKS_READS.reminders(),
    HABITS_READS.list(),
    PSYCHOLOGY_READS.gentleSteps(),
    PSYCHOLOGY_READS.gentleDay(today),
    DIARY_READS.settings(),
    DIARY_READS.stats(),
    DIARY_READS.insights(),
    DIARY_READS.calendar(month.year),
    ...months,
    ...days,
  ];
}

/**
 * Reads them all, then the photos of the recent days (a kept photo is not downloaded again:
 * `diary.photo` takes the kept file first); one that fails is left for the next time.
 */
export async function prefetchForOffline(
  http: HttpClient,
  api: ApiClient,
  now = new Date(),
): Promise<void> {
  const photoIds: string[] = [];
  const photoLists = new Set(
    recentDays(now).map(day => DIARY_READS.photos(day).url),
  );
  await inParallel(offlineReads(now), async read => {
    const body = await firstValueFrom(
      http.get(read.url, {params: read.params}),
    ).catch(() => undefined);
    if (photoLists.has(read.url) && Array.isArray(body)) {
      photoIds.push(...(body as DiaryPhoto[]).map(photo => photo.id));
    }
  });
  const diary = diaryApi(api);
  await inParallel(photoIds, id =>
    diary.photo(id).then(
      () => undefined,
      () => undefined,
    ),
  );
}

async function inParallel<T>(
  items: T[],
  work: (item: T) => Promise<void>,
): Promise<void> {
  const queue = [...items];
  const worker = async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) {
      await work(item);
    }
  };
  await Promise.all(Array.from({length: PARALLEL}, worker));
}
