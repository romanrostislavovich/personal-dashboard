import { describe, expect, it } from 'vitest';
import { noticeText } from './notices';

describe('smart break notification', () => {
  it('localizes the optional suggestion without claiming a measured health state', () => {
    expect(noticeText({ kind: 'smart-break' }, 'ru-RU')).toEqual({
      title: 'Удобный момент для перерыва',
      body: 'Задача завершена. После 50 минут активности можно ненадолго отвлечься, если вам удобно.',
    });
    expect(noticeText({ kind: 'smart-break' }, 'en-US')).toEqual({
      title: 'A good moment for a break',
      body: 'Task completed. After 50 minutes of activity, consider a short break if it suits you.',
    });
    expect(noticeText({ kind: 'smart-break' }, 'de')).toEqual(
      noticeText({ kind: 'smart-break' }, 'en'),
    );
  });
});
