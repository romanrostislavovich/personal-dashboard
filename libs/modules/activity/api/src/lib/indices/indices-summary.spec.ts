import {indexSummary, summaryPeriod} from './indices-summary';

const TODAY = '2026-11-06';
const day = (back: number) => {
  const date = new Date(`${TODAY}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - back);
  return date.toISOString().slice(0, 10);
};

describe('indexSummary', () => {
  it('gives today, the week and the norm of the weeks before', () => {
    const days = [
      // The four weeks before: 1 hour of deep work a day.
      ...Array.from({length: 28}, (_, index) => ({
        day: day(8 + index),
        value: 1,
      })),
      // The week: 2 hours, today 3.
      ...Array.from({length: 7}, (_, index) => ({
        day: day(1 + index),
        value: 2,
      })),
      {day: TODAY, value: 3},
    ];
    const [deep] = indexSummary(new Map([['deepWork', days]]), TODAY);
    expect(deep).toEqual({
      key: 'deepWork',
      unit: 'hours',
      today: 3,
      week: 2,
      norm: 1,
    });
  });

  it('knows no norm with less than a week before, and no today when not counted', () => {
    const [deep] = indexSummary(
      new Map([['deepWork', [{day: day(1), value: 2}]]]),
      TODAY,
    );
    expect(deep).toMatchObject({today: null, week: 2, norm: null});
  });

  it('leaves out an index never counted, and reads five weeks back', () => {
    expect(indexSummary(new Map(), TODAY)).toEqual([]);
    expect(summaryPeriod(TODAY)).toEqual({from: day(35), to: TODAY});
  });
});
