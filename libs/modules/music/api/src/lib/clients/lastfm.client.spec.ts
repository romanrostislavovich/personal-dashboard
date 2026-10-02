import { isTemporary } from './lastfm.client';

describe('isTemporary', () => {
  it('knows the Last.fm errors that pass by themselves', () => {
    // "Operation failed - Most likely the backend service failed. Please try again."
    expect(isTemporary(200, 8)).toBe(true);
    expect(isTemporary(200, 11)).toBe(true);
    expect(isTemporary(200, 16)).toBe(true);
    expect(isTemporary(200, 29)).toBe(true);
    expect(isTemporary(502, undefined)).toBe(true);
    expect(isTemporary(429, undefined)).toBe(true);
  });

  it('leaves the errors that need a fix alone', () => {
    expect(isTemporary(200, undefined)).toBe(false);
    expect(isTemporary(403, 10)).toBe(false);
    expect(isTemporary(404, 6)).toBe(false);
  });
});
