import { RateLimiter } from './rate-limit';

describe('RateLimiter', () => {
  it('lets the limit through, then says how long to wait, then lets in again', () => {
    let now = 0;
    const limiter = new RateLimiter(() => now);
    const limit = { limit: 3, perSeconds: 60 };
    expect([1, 2, 3].map(() => limiter.hit('chat:me', limit))).toEqual([null, null, null]);
    now = 20_000;
    expect(limiter.hit('chat:me', limit)).toBe(40);
    // Someone else is counted apart.
    expect(limiter.hit('chat:other', limit)).toBeNull();
    now = 60_000;
    expect(limiter.hit('chat:me', limit)).toBeNull();
  });
});
