import { Session } from './session';
import { memoryStorage } from './testing';

describe('Session', () => {
  it('keeps the token in the storage and tells subscribers about changes', async () => {
    const storage = memoryStorage({ 'pd.accessToken': 'saved' });
    const session = new Session(storage);
    const seen: (string | null)[] = [];
    session.subscribe((token) => seen.push(token));

    expect(await session.restore()).toBe('saved');
    await session.start('fresh');
    expect(storage.values.get('pd.accessToken')).toBe('fresh');
    await session.end();

    expect(storage.values.has('pd.accessToken')).toBe(false);
    expect(session.isSignedIn).toBe(false);
    expect(seen).toEqual(['saved', 'fresh', null]);
  });

  it('does not repeat an unchanged token', async () => {
    const session = new Session(memoryStorage());
    const listener = vi.fn();
    const unsubscribe = session.subscribe(listener);

    await session.restore(); // null → null
    await session.start('a');
    await session.start('a');
    unsubscribe();
    await session.end();

    expect(listener).toHaveBeenCalledTimes(1);
  });
});
