import { mondayOf, parseQuestions } from './reflections.service';

describe('mondayOf', () => {
  it('gives the Monday of the week, for any day of it', () => {
    expect(mondayOf('2026-10-05')).toBe('2026-10-05');
    expect(mondayOf('2026-10-10')).toBe('2026-10-05');
    expect(mondayOf('2026-10-11')).toBe('2026-10-05');
    expect(mondayOf('2026-10-12')).toBe('2026-10-12');
  });
});

describe('parseQuestions', () => {
  it('takes the questions out of a numbered or bulleted answer', () => {
    const reply = [
      'Here are your questions:',
      '1. What made Tuesday so heavy?',
      '2) What helped you finish the checkout fix?',
      '- What would you keep from this week?',
      '• And a fourth one, too many?',
    ].join('\n');
    expect(parseQuestions(reply)).toEqual([
      'What made Tuesday so heavy?',
      'What helped you finish the checkout fix?',
      'What would you keep from this week?',
    ]);
  });

  it('gives nothing when the answer is not a list of questions', () => {
    expect(parseQuestions('I cannot help with that.')).toBeNull();
    expect(parseQuestions('Only one question?')).toBeNull();
  });
});
