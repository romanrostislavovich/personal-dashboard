import { ACTIVITY_TITLE_MAX, activityIngestSchema, isMeetingTitle } from './activity';

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

describe('isMeetingTitle', () => {
  it('knows calls in browsers and messengers', () => {
    expect(isMeetingTitle('Meet - abc-defg-hij - Google Chrome')).toBe(true);
    expect(isMeetingTitle('Zoom Meeting')).toBe(true);
    expect(isMeetingTitle('Daily standup | Meeting | Microsoft Teams')).toBe(true);
    expect(isMeetingTitle('Звонок | Microsoft Teams')).toBe(true);
  });

  it('leaves ordinary windows alone', () => {
    expect(isMeetingTitle('meeting notes.docx - Word')).toBe(false);
    expect(isMeetingTitle('Chat | Microsoft Teams')).toBe(false);
    expect(isMeetingTitle('Telegram')).toBe(false);
  });
});
