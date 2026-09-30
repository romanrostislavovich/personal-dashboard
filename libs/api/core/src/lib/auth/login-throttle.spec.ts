import { HttpException } from '@nestjs/common';
import { LoginThrottle, throttleKeys } from './login-throttle';

describe('LoginThrottle', () => {
  it('locks after 10 failures for 15 minutes; a success clears it', () => {
    let now = 0;
    const throttle = new LoginThrottle(() => now);
    const keys = throttleKeys('1.2.3.4', 'Me@Example.com');

    for (let i = 0; i < 10; i++) {
      throttle.check(keys);
      throttle.fail(keys);
    }
    expect(() => throttle.check(keys)).toThrow(HttpException);
    // Another address is still locked out of this account.
    expect(() => throttle.check(throttleKeys('5.6.7.8', 'me@example.com'))).toThrow();

    now += 15 * 60 * 1000;
    expect(() => throttle.check(keys)).not.toThrow();

    throttle.fail(keys);
    throttle.succeed(keys);
    for (let i = 0; i < 9; i++) {
      throttle.fail(keys);
    }
    expect(() => throttle.check(keys)).not.toThrow();
  });
});
