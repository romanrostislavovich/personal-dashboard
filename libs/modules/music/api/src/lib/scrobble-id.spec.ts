import { scrobbleId } from './scrobble-id';

describe('scrobbleId', () => {
  const at = new Date('2014-03-01T12:00:00Z');

  it('is a stable UUID v5 for the same play', () => {
    const id = scrobbleId('u1', at, 'Song');
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(scrobbleId('u1', new Date(at), 'Song')).toBe(id);
  });

  it('differs for another user, time or track', () => {
    const id = scrobbleId('u1', at, 'Song');
    expect(scrobbleId('u2', at, 'Song')).not.toBe(id);
    expect(scrobbleId('u1', new Date(at.getTime() + 1000), 'Song')).not.toBe(id);
    expect(scrobbleId('u1', at, 'Other')).not.toBe(id);
  });
});
