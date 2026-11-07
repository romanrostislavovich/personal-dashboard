import {QuestionAnswer, QuestionNumber} from '@pd/contracts';
import {
  answerSentence,
  chanceOf,
  confounderLines,
  insightSentence,
  Wording,
} from './question-wording';

/** Keys and their parameters, so the sentence's parts can be checked without the texts. */
const wording: Wording = {
  locale: 'en',
  translate: (key, params) =>
    params
      ? `${key}(${Object.entries(params)
          .map(([name, value]) => `${name}=${value}`)
          .join(',')})`
      : key,
};

const number = (key: string, unit: QuestionNumber['unit']): QuestionNumber => ({
  key,
  module: key.split('.')[0],
  labelKey: key,
  unit,
});

const answer = (more: Partial<QuestionAnswer> = {}): QuestionAnswer => ({
  status: 'answered',
  n: 90,
  threshold: 3,
  high: 1.5,
  low: 3,
  difference: -1.5,
  p: 0.001,
  strong: true,
  confounders: [
    {confounder: 'weekend', holds: true},
    {confounder: 'rain', holds: null},
    {confounder: 'travel', holds: false},
  ],
  condition: null,
  ...more,
});

describe('the wording of questions and findings', () => {
  it('tells a pair in its units, the next day', () => {
    const sentence = answerSentence(
      number('activity.index.focusInterruptions', 'count'),
      number('activity.index.deepWork', 'hours'),
      'nextDay',
      answer(),
      wording,
    );
    expect(sentence).toContain('life.questions.pair(');
    expect(sentence).toContain('when=life.questions.when.nextDay');
    expect(sentence).toContain('high=life.hours(value=1.5)');
    expect(sentence).toContain('n=90');
  });

  it('tells the hour after in minutes, and few days as few', () => {
    expect(
      answerSentence(
        number('music.event.listening', 'count'),
        number('activity.hour.deepWork', 'minutes'),
        'hourAfter',
        answer({high: 34.4, low: 12}),
        wording,
      ),
    ).toContain('after=life.hourly.minutes(value=34)');
    expect(
      answerSentence(
        number('a.b', 'count'),
        number('c.d', 'count'),
        'sameDay',
        answer({status: 'few', n: 12, high: null}),
        wording,
      ),
    ).toBe('life.questions.few(n=12)');
  });

  it('lists only the confounders that were checked', () => {
    expect(confounderLines(answer(), wording)).toEqual([
      'life.questions.holds(what=life.questions.confounder.weekend)',
      'life.questions.explains(what=life.questions.confounder.travel)',
    ]);
  });

  it('tells a change of level', () => {
    expect(
      insightSentence(
        {
          kind: 'change',
          number: number('activity.phone.night', 'hours'),
          day: '2026-10-12',
          before: 1,
          after: 2,
        },
        wording,
      ),
    ).toContain('life.insights.change(');
  });

  it('tells a tiny chance as less than a hundredth of a percent', () => {
    expect(chanceOf(0, wording)).toBe('< 0.01%');
    expect(chanceOf(0.031, wording)).toBe('3.1%');
  });
});
