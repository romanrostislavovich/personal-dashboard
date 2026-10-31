import {isMeetingTitle} from '@pd/contracts';
import {describe, expect, it} from 'vitest';
import {isMeeting, isPrivateWindow} from './window-rules';

describe('window rules', () => {
  it('keeps private windows and the private words out', () => {
    expect(isPrivateWindow('New Tab - InPrivate - Microsoft Edge', [])).toBe(
      true,
    );
    expect(isPrivateWindow('Mozilla Firefox Private Browsing', [])).toBe(true);
    expect(isPrivateWindow('Новая вкладка — Инкогнито', [])).toBe(true);
    expect(isPrivateWindow('Bank — Statement', ['bank'])).toBe(true);
    expect(isPrivateWindow('GitHub — Pull requests', ['bank'])).toBe(false);
  });

  it('tells a call by its program or its window', () => {
    expect(isMeeting('zoom.exe', 'Zoom', ['zoom.exe'])).toBe(true);
    expect(isMeeting('chrome', 'Meet - abc-defg-hij', [])).toBe(true);
    expect(isMeeting('chrome', 'Meeting notes - Google Docs', [])).toBe(false);
  });

  // The server counts calls by the same rule; the two copies must not drift apart.
  it.each([
    'Meet - abc-defg-hij',
    'Google Meet',
    'Zoom Meeting',
    'Daily call | Microsoft Teams',
    'Звонок | Microsoft Teams',
    'Telegram Call',
    'звонок',
    'Meeting notes - Google Docs',
    'Calling all cars',
  ])('agrees with the server about "%s"', title => {
    expect(isMeeting('chrome', title, [])).toBe(isMeetingTitle(title));
  });
});
