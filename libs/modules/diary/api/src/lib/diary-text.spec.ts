import { appendNote, extractTags } from './diary-text';
import { computeStreaks } from './streaks';

describe('extractTags', () => {
  it('finds hashtags in Cyrillic and Latin, lowercased and unique', () => {
    expect(extractTags('Утром #Спорт, потом #work и снова #спорт. #side_project')).toEqual([
      'спорт',
      'work',
      'side_project',
    ]);
  });

  it('ignores markdown headings and anchors inside words', () => {
    expect(extractTags('# Заголовок\n## Ещё\nemail@host#frag и c#')).toEqual([]);
  });
});

describe('appendNote', () => {
  it('starts an empty entry with the note', () => {
    expect(appendNote('', ' Первая мысль ', '09:15')).toBe('**09:15** Первая мысль');
  });

  it('appends to existing text with a blank line', () => {
    expect(appendNote('Утро было хорошим.\n', 'Обед', '13:00')).toBe(
      'Утро было хорошим.\n\n**13:00** Обед',
    );
  });
});

describe('computeStreaks', () => {
  const today = { year: 2026, month: 9, day: 27 };

  it('counts the current streak including today', () => {
    expect(computeStreaks(['2026-09-25', '2026-09-26', '2026-09-27'], today).current).toBe(3);
  });

  it('keeps the streak alive if today is not written yet', () => {
    expect(computeStreaks(['2026-09-25', '2026-09-26'], today).current).toBe(2);
  });

  it('resets after a missed day', () => {
    expect(computeStreaks(['2026-09-24', '2026-09-25'], today).current).toBe(0);
  });

  it('finds the longest streak across month boundaries', () => {
    const days = ['2026-08-30', '2026-08-31', '2026-09-01', '2026-09-02', '2026-09-10'];
    expect(computeStreaks(days, today)).toEqual({ current: 0, longest: 4 });
  });

  it('handles no entries', () => {
    expect(computeStreaks([], today)).toEqual({ current: 0, longest: 0 });
  });
});
