import { DailyMetric, LocalDate, MoodInsight, MoodInsights } from '@pd/contracts';

/** The daily number that is the mood itself (the diary registers it). */
export const MOOD_METRIC = 'diary.mood';
/** On the diary's scale of 1–5: a good day and a bad one; the middle says nothing. */
const GOOD_FROM = 4;
const BAD_UP_TO = 2;
/** Fewer days of a kind than this, and an average of them is a coincidence. */
const MIN_DAYS = 3;
/** A number seen on fewer of the compared days than this is too rare to compare by. */
const MIN_DAYS_WITH_VALUE = 5;
/** A difference smaller than this is not worth showing. */
const MIN_DIFFERENCE_PERCENT = 15;

/**
 * A day without a quantity (hours, money, plays) is a day of zero; a day without a reading
 * (the temperature, a time of the day) is a day nobody measured, and is left out.
 */
const READINGS: DailyMetric['unit'][] = ['degrees', 'clock', 'score'];
/**
 * A reading is compared by the difference itself — percent of a temperature or of an hour of
 * the day means nothing: this much of it is worth showing.
 */
const MIN_READING_DIFFERENCE: Partial<Record<DailyMetric['unit'], number>> = {
  degrees: 2,
  clock: 0.5,
  score: 0.5,
};

const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

/**
 * What goes with a good day and what with a bad one: for every daily number, its average on the
 * days of a good mood against the days of a bad one. A day without a quantity counts as zero
 * (no spending is a day of zero spent), a day without a reading is left out (see READINGS);
 * a day without a mood is not looked at.
 *
 * It shows what goes together, not what causes what — the page says so.
 */
export function moodInsights(
  metrics: DailyMetric[],
  period: { from: LocalDate; to: LocalDate },
): MoodInsights {
  const mood = new Map(
    (metrics.find((metric) => metric.key === MOOD_METRIC)?.days ?? []).map((day) => [
      day.day,
      day.value,
    ]),
  );
  const good = [...mood].filter(([, value]) => value >= GOOD_FROM).map(([day]) => day);
  const bad = [...mood].filter(([, value]) => value <= BAD_UP_TO).map(([day]) => day);
  const enough = good.length >= MIN_DAYS && bad.length >= MIN_DAYS;

  const insights: MoodInsight[] = [];
  if (enough) {
    for (const metric of metrics.filter((item) => item.key !== MOOD_METRIC)) {
      const values = new Map(metric.days.map((day) => [day.day, day.value]));
      // One task done on one good day is not "tasks go with good days".
      if ([...good, ...bad].filter((day) => values.get(day)).length < MIN_DAYS_WITH_VALUE) {
        continue;
      }
      const reading = READINGS.includes(metric.unit);
      const of = (days: LocalDate[]) =>
        reading
          ? days.flatMap((day) => (values.has(day) ? [values.get(day) as number] : []))
          : days.map((day) => values.get(day) ?? 0);
      const [onGood, onBad] = [of(good), of(bad)];
      if (onGood.length < MIN_DAYS || onBad.length < MIN_DAYS) {
        continue;
      }
      const onGoodDays = average(onGood);
      const onBadDays = average(onBad);
      const difference = onGoodDays - onBadDays;
      const base = Math.max(Math.abs(onGoodDays), Math.abs(onBadDays));
      const differencePercent = base ? Math.round((difference / base) * 100) : 0;
      const minimum = MIN_READING_DIFFERENCE[metric.unit];
      const worth = reading
        ? Math.abs(difference) >= (minimum ?? 0)
        : Math.abs(differencePercent) >= MIN_DIFFERENCE_PERCENT;
      if (worth) {
        insights.push({
          key: metric.key,
          module: metric.module,
          labelKey: metric.labelKey,
          unit: metric.unit,
          currency: metric.currency,
          onGoodDays: Math.round(onGoodDays * 100) / 100,
          onBadDays: Math.round(onBadDays * 100) / 100,
          difference: Math.round(difference * 100) / 100,
          differencePercent,
          reading,
        });
      }
    }
  }
  return {
    ...period,
    days: mood.size,
    goodDays: good.length,
    badDays: bad.length,
    enough,
    // The quantities by how much they differ; the readings after them.
    insights: insights.sort(
      (a, b) =>
        Number(a.reading) - Number(b.reading) ||
        Math.abs(b.differencePercent) - Math.abs(a.differencePercent),
    ),
  };
}
