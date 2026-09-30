import { Session } from './session';
import { memoryStorage } from './testing';

describe('Session', () => {
  it('keeps the access token in memory and an app’s refresh token in the storage', async () => {
    const storage = memoryStorage();
    const session = new Session(storage, 'storage');
    const seen: (string | null)[] = [];
    session.subscribe((token) => seen.push(token));

    await session.start('access-1', 'refresh-1');
    expect(session.token).toBe('access-1');
    expect(await session.refreshToken()).toBe('refresh-1');
    expect([...storage.values.keys()]).toEqual(['pd.refreshToken']); // No access token stored.

    await session.start('access-2'); // A refresh without rotation keeps the refresh token.
    expect(await session.refreshToken()).toBe('refresh-1');
    await session.end();

    expect(storage.values.size).toBe(0);
    expect(session.isSignedIn).toBe(false);
    expect(seen).toEqual(['access-1', 'access-2', null]);
  });

  it('a browser keeps nothing: its refresh token is in an httpOnly cookie', async () => {
    const storage = memoryStorage();
    const session = new Session(storage, 'cookie');
    await session.start('access', 'refresh');

    expect(storage.values.size).toBe(0);
    expect(await session.refreshToken()).toBeNull();
  });
});
