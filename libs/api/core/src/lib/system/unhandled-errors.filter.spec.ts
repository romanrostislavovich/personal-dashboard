import { describeFetchFailure } from './unhandled-errors.filter';

describe('describeFetchFailure', () => {
  it('tells why a request to an outside service failed', () => {
    const error = new TypeError('fetch failed', {
      cause: Object.assign(new Error('getaddrinfo ENOTFOUND api.example.com'), {
        code: 'ENOTFOUND',
        hostname: 'api.example.com',
      }),
    });
    expect(describeFetchFailure(error)).toBe(
      'An outside service could not be reached (ENOTFOUND api.example.com)',
    );
  });

  it('falls back to the text of the cause, or to nothing', () => {
    expect(
      describeFetchFailure(new TypeError('fetch failed', { cause: new Error('socket hang up') })),
    ).toBe('An outside service could not be reached (socket hang up)');
    expect(describeFetchFailure(new TypeError('fetch failed'))).toBe(
      'An outside service could not be reached',
    );
  });

  it('knows a timeout', () => {
    const timeout = Object.assign(new Error('The operation was aborted'), { name: 'TimeoutError' });
    expect(describeFetchFailure(timeout)).toBe('An outside service did not answer in time');
  });

  it('leaves other errors alone', () => {
    expect(describeFetchFailure(new TypeError('x is not a function'))).toBeNull();
    expect(describeFetchFailure(new Error('fetch failed'))).toBeNull();
    expect(describeFetchFailure('fetch failed')).toBeNull();
  });
});
