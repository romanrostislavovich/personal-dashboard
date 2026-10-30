import {describe, expect, it} from 'vitest';
import {
  lifelogDaySchema,
  lifelogGeneratedSchema,
  lifelogNoteSchema,
  lifelogQuerySchema,
} from './lifelog';

describe('lifelog contracts', () => {
  it('accepts real dates and bounds the range', () => {
    expect(lifelogDaySchema.safeParse('2026-02-30').success).toBe(false);
    expect(
      lifelogQuerySchema.safeParse({from: '2026-10-01', to: '2026-10-31'})
        .success,
    ).toBe(true);
    expect(
      lifelogQuerySchema.safeParse({from: '2026-10-31', to: '2026-10-01'})
        .success,
    ).toBe(false);
    expect(
      lifelogQuerySchema.safeParse({from: '2026-01-01', to: '2026-12-31'})
        .success,
    ).toBe(false);
  });
  it('requires evidence and does not accept invented biometric scores', () => {
    const draft = {
      summaryText: 'A day of work.',
      keyHighlight: '',
      generatedBy: 'ai',
      sources: [{module: 'activity', key: 'activity.life.work', at: null}],
    };
    expect(lifelogGeneratedSchema.safeParse(draft).success).toBe(true);
    expect(
      lifelogGeneratedSchema.safeParse({...draft, sources: []}).success,
    ).toBe(false);
    expect(
      lifelogGeneratedSchema.safeParse({...draft, recoveryScore: 90}).success,
    ).toBe(false);
  });
  it('only accepts the bounded user note for editing', () => {
    expect(lifelogNoteSchema.parse({note: ' My note '})).toEqual({
      note: 'My note',
    });
    expect(
      lifelogNoteSchema.safeParse({note: '', summaryText: 'override'}).success,
    ).toBe(false);
    expect(lifelogNoteSchema.safeParse({note: 'x'.repeat(2001)}).success).toBe(
      false,
    );
  });
});
