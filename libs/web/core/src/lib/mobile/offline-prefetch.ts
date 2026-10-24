import { HttpClient } from '@angular/common/http';
import {
  ApiRequest,
  DIARY_READS,
  HABITS_READS,
  PSYCHOLOGY_READS,
  TASKS_READS,
} from '@pd/client-core';
import { addDays, parseLocalDate, toLocalDate } from '@pd/contracts';
import { firstValueFrom } from 'rxjs';
import { currentMonth, monthRange, shiftMonth, todayLocalDate } from '../utils/month';

/** Months of the diary to have for reading on the way. */
const DIARY_MONTHS = 12;
/** Days whose entries open in the editor without a connection. */
const DIARY_DAYS = 31;
/** Reads sent at once: the phone stays usable while it goes. */
const PARALLEL = 4;

/**
 * What the Android app reads ahead while it has a connection, so it is there on a train: the
 * diary of the last year, tasks and reminders, habits, the gentle day. Each read goes through
 * HttpClient like the pages' own, with the same address and parameters, so the read cache
 * (offline-read.interceptor.ts) answers the page later. Sections opened before are kept anyway.
 */
export function offlineReads(now = new Date()): ApiRequest[] {
  const today = todayLocalDate(now);
  const month = currentMonth(now);
  const months = Array.from({ length: DIARY_MONTHS }, (_, i) =>
    DIARY_READS.entries(monthRange(shiftMonth(month, -i))),
  );
  const days = Array.from({ length: DIARY_DAYS }, (_, i) =>
    DIARY_READS.entry(toLocalDate(addDays(parseLocalDate(today), -i))),
  );
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

/** Reads them all; one that fails is left for the next time. */
export async function prefetchForOffline(http: HttpClient, now = new Date()): Promise<void> {
  const queue = offlineReads(now);
  const worker = async () => {
    for (let read = queue.shift(); read; read = queue.shift()) {
      await firstValueFrom(http.get(read.url, { params: read.params })).catch(() => undefined);
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));
}
