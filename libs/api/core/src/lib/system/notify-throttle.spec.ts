import { NotifyThrottle } from './notify-throttle';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

describe('NotifyThrottle', () => {
  it('tells about the same problem once in six hours', () => {
    const throttle = new NotifyThrottle();
    expect(throttle.allow('job failed', 0)).toBe(true);
    expect(throttle.allow('job failed', 30 * MINUTE)).toBe(false);
    expect(throttle.allow('job failed', 5 * HOUR)).toBe(false);
    expect(throttle.allow('job failed', 6 * HOUR + MINUTE)).toBe(true);
  });

  it('lets different problems through, but only five an hour', () => {
    const throttle = new NotifyThrottle();
    const sent = Array.from({ length: 8 }, (_, i) => throttle.allow(`problem ${i}`, i * MINUTE));
    expect(sent).toEqual([true, true, true, true, true, false, false, false]);
    // An hour after the first ones the limit is free again.
    expect(throttle.allow('problem 9', 61 * MINUTE)).toBe(true);
  });

  it('does not count a suppressed problem as told', () => {
    const throttle = new NotifyThrottle();
    for (let i = 0; i < 5; i++) {
      throttle.allow(`problem ${i}`, 0);
    }
    expect(throttle.allow('late problem', MINUTE)).toBe(false);
    expect(throttle.allow('late problem', 2 * HOUR)).toBe(true);
  });
});
