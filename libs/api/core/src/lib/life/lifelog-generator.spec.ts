import { LifeEvent } from '@pd/contracts';
import { LifelogGenerator } from './lifelog-generator.service';
import { lifelogFacts } from './lifelog-generation';
import { lifelogDueDay } from './lifelog.job';

const event: LifeEvent = {
  module: 'activity',
  key: 'activity.life.focus',
  at: '2020-10-01T12:00:00Z',
  link: '/activity',
  icon: 'timer',
  params: { hours: 2 },
};

function fixture(events: LifeEvent[] = [event]) {
  const lifelog = {
    get: vi.fn().mockResolvedValue(null),
    saveGenerated: vi
      .fn()
      .mockImplementation(async (_user, day, input) => ({ ...input, day, note: 'kept' })),
  };
  const life = { day: vi.fn().mockResolvedValue({ day: '2020-10-01', events }) };
  const ai = {
    isConfigured: vi.fn().mockResolvedValue(true),
    hiddenFromShared: vi.fn().mockResolvedValue(['health']),
    complete: vi
      .fn()
      .mockResolvedValue(
        JSON.stringify({ summaryText: 'A focused day.', keyHighlight: 'Two hours of focus.' }),
      ),
  };
  const users = { findById: vi.fn().mockResolvedValue({ locale: 'en' }), timeZoneOf: () => 'UTC' };
  const generator = new LifelogGenerator(
    lifelog as never,
    life as never,
    ai as never,
    users as never,
  );
  return { generator, lifelog, life, ai };
}

describe('daily chronicle generation', () => {
  it('excludes hidden modules and stores provenance from facts, not from the model', async () => {
    const f = fixture([
      event,
      { ...event, module: 'health', params: { diagnosis: 'private medical text' } },
    ]);
    const result = await f.generator.generate('owner', '2020-10-01');
    expect(f.life.day).toHaveBeenCalledWith('owner', '2020-10-01', ['health']);
    const payload = f.ai.complete.mock.calls[0][2];
    expect(payload).not.toContain('medical');
    expect(payload).not.toContain('kept');
    expect(result?.sources).toEqual([{ module: 'activity', key: event.key, at: event.at }]);
    expect(result?.generatedBy).toBe('ai');
  });

  it('coalesces concurrent generation and reuses a saved narrative', async () => {
    const f = fixture();
    await Promise.all([
      f.generator.generate('u', '2020-10-01'),
      f.generator.generate('u', '2020-10-01'),
    ]);
    expect(f.ai.complete).toHaveBeenCalledTimes(1);
    f.lifelog.get.mockResolvedValue({ summaryText: 'Saved.' });
    expect(await f.generator.generate('u', '2020-10-01')).toEqual({ summaryText: 'Saved.' });
    expect(f.ai.complete).toHaveBeenCalledTimes(1);
  });

  it('does not invent a chronicle for an empty or completely hidden day', async () => {
    const f = fixture([{ ...event, module: 'health' }]);
    expect(await f.generator.generate('u', '2020-10-01')).toBeNull();
    expect(f.ai.complete).not.toHaveBeenCalled();
    expect(f.lifelog.saveGenerated).not.toHaveBeenCalled();
  });

  it('rejects invalid model output and allows manual retry after provider failure', async () => {
    const f = fixture();
    f.ai.complete.mockRejectedValueOnce(new Error('provider unavailable'));
    await expect(f.generator.generate('u', '2020-10-01')).rejects.toThrow();
    f.ai.complete.mockResolvedValueOnce(
      '{"summaryText":"ok","keyHighlight":"","recoveryScore":80}',
    );
    await expect(f.generator.generate('u', '2020-10-01')).rejects.toThrow('invalid chronicle');
    expect(f.lifelog.saveGenerated).not.toHaveBeenCalled();
    expect(await f.generator.generate('u', '2020-10-01')).not.toBeNull();
  });

  it('does not generate without a provider or for future dates', async () => {
    const f = fixture();
    f.ai.isConfigured.mockResolvedValue(false);
    await expect(f.generator.generate('u', '2020-10-01')).rejects.toThrow('Configure AI');
    await expect(f.generator.generate('u', '9999-01-01')).rejects.toThrow('future');
    expect(f.ai.complete).not.toHaveBeenCalled();
  });

  it('bounds and orders events and excludes secret-like values', () => {
    const safe = lifelogFacts([
      {
        ...event,
        params: {
          token: 'bearer secret',
          email: 'a@example.com',
          count: 2,
          url: 'https://example.com',
        },
      },
      { ...event, at: null },
    ]);
    expect(safe[0].at).toBeNull();
    expect(safe[1].params).toEqual({ count: 2 });
    expect(lifelogFacts(Array.from({ length: 300 }, () => event))).toHaveLength(200);
  });

  it('uses local dates across DST and year boundaries', () => {
    expect(lifelogDueDay(new Date('2026-10-25T00:30:00Z'), 'Europe/Warsaw')).toBeNull();
    expect(lifelogDueDay(new Date('2026-10-25T02:30:00Z'), 'Europe/Warsaw')).toBe('2026-10-24');
    expect(lifelogDueDay(new Date('2026-01-01T09:00:00Z'), 'America/New_York')).toBe('2025-12-31');
  });
});
