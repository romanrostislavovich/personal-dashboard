import {Injectable, OnModuleInit} from '@nestjs/common';
import {daysOf, LinksService} from '@pd/api-core';
import {addDays, parseLocalDate, toLocalDate, zonedToUtc} from '@pd/contracts';
import {WakatimeSpansService} from './wakatime-spans.service';

const MINUTE = 60_000;

/**
 * Coding hour by hour for Links: the minutes of each hour WakaTime saw coding in (its stretches
 * by project, what overlaps counted once) — a productive number of the window. The days from the
 * first stretch to the last: before them the stretches were not copied yet.
 */
@Injectable()
export class WakatimeHoursLinks implements OnModuleInit {
  constructor(
    private readonly links: LinksService,
    private readonly spans: WakatimeSpansService,
  ) {}

  onModuleInit(): void {
    this.links.registerHourly({
      module: 'development',
      hours: async (userId, period, timeZone) => {
        const after = toLocalDate(addDays(parseLocalDate(period.to), 1));
        const from = zonedToUtc({date: period.from, time: '00:00'}, timeZone);
        const to = zonedToUtc({date: after, time: '00:00'}, timeZone);
        const parts = union(
          (await this.spans.between(userId, 'project', from, to)).map(span => ({
            start: Math.max(span.startedAt.getTime(), from.getTime()),
            end: Math.min(span.endedAt.getTime(), to.getTime()),
          })),
        );
        if (!parts.length) {
          return {metrics: [], events: []};
        }
        // The wall clock's hours of the period, in order: on a day the clocks change 23:00 is
        // still 23:00.
        const slots = daysOf(period).flatMap(day =>
          [...Array(24).keys()].map(hour => {
            const time = `${String(hour).padStart(2, '0')}:00`;
            return {
              hour: `${day}T${time.slice(0, 2)}`,
              start: zonedToUtc({date: day, time}, timeZone).getTime(),
            };
          }),
        );
        const ms = new Map<string, number>();
        // Both are in order: each part walks only the hours it touches.
        let first = 0;
        for (const part of parts) {
          while (
            first + 1 < slots.length &&
            slots[first + 1].start <= part.start
          ) {
            first++;
          }
          for (
            let i = first;
            i < slots.length && slots[i].start < part.end;
            i++
          ) {
            const end = slots[i + 1]?.start ?? to.getTime();
            const inside =
              Math.min(part.end, end) - Math.max(part.start, slots[i].start);
            if (inside > 0) {
              ms.set(slots[i].hour, (ms.get(slots[i].hour) ?? 0) + inside);
            }
          }
        }
        const minutes = new Map(
          [...ms].map(([hour, value]) => [hour, Math.round(value / MINUTE)]),
        );
        const known = [...minutes.keys()].map(hour => hour.slice(0, 10)).sort();
        return {
          metrics: [
            {
              key: 'development.hour.coding',
              module: 'development',
              labelKey: 'development.links.hour.coding',
              unit: 'minutes',
              productive: true,
              days: daysOf(period).filter(
                day => day >= known[0] && day <= known[known.length - 1],
              ),
              hours: [...minutes]
                .filter(([, value]) => value > 0)
                .map(([hour, value]) => ({hour, value})),
            },
          ],
          events: [],
        };
      },
    });
  }
}

function union(parts: {start: number; end: number}[]) {
  const sorted = parts
    .filter(part => part.end > part.start)
    .sort((a, b) => a.start - b.start);
  const result: {start: number; end: number}[] = [];
  for (const part of sorted) {
    const last = result[result.length - 1];
    if (last && part.start <= last.end) {
      last.end = Math.max(last.end, part.end);
    } else {
      result.push({...part});
    }
  }
  return result;
}
