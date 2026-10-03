import { ACTIVITY_TITLE_MAX, activityIngestSchema } from './activity';

describe('activityIngestSchema', () => {
  const span = (title: string) => ({
    app: 'chrome',
    appName: 'Google Chrome',
    title,
    startedAt: '2026-10-03T10:53:00.000Z',
    endedAt: '2026-10-03T10:53:05.000Z',
  });

  it('cuts a long window title instead of refusing the whole batch', () => {
    const result = activityIngestSchema.safeParse({ spans: [span('a'.repeat(511)), span('b')] });
    expect(result.success).toBe(true);
    expect(result.data?.spans[0].title).toHaveLength(ACTIVITY_TITLE_MAX);
    expect(result.data?.spans[1].title).toBe('b');
  });

  it('still refuses a span that ends before it starts', () => {
    const backwards = { ...span('x'), endedAt: '2026-10-03T10:52:00.000Z' };
    expect(activityIngestSchema.safeParse({ spans: [backwards] }).success).toBe(false);
  });
});
