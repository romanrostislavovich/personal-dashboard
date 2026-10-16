import { nextFreeName, Screenshot } from '@pd/contracts';
import {
  ScreenshotFolder,
  ScreenshotIndex,
  ScreenshotsClient,
  ScreenshotSyncStopped,
  syncScreenshots,
} from './screenshots';

/** A file's "hash" in these tests is its text. */
const text = (data: Uint8Array) => new TextDecoder().decode(data);
const bytes = (value: string) => new TextEncoder().encode(value);

/** The server, in memory. */
function fakeServer() {
  const shots = new Map<string, Screenshot & { data: string }>();
  let next = 0;
  const meta = ({ data: _data, ...shot }: Screenshot & { data: string }): Screenshot => shot;
  const store = (id: string, name: string, data: string) => {
    const shot = {
      id,
      name,
      hash: data,
      data,
      mimeType: 'image/png',
      size: data.length,
      width: null,
      height: null,
      createdAt: '',
      updatedAt: '',
    };
    shots.set(id, shot);
    return meta(shot);
  };
  const api = {
    list: async () => [...shots.values()].map(meta),
    add: async (name: string, file: Blob) => {
      const taken = new Set([...shots.values()].map((shot) => shot.name));
      return store(
        `s${++next}`,
        nextFreeName(name, (one) => taken.has(one)),
        await file.text(),
      );
    },
    replace: async (id: string, name: string, file: Blob) =>
      store(id, shots.get(id)?.name ?? name, await file.text()),
    file: async (id: string) => new Blob([shots.get(id)?.data ?? '']),
    remove: async (id: string) => void shots.delete(id),
  };
  return { shots, api: api as unknown as ScreenshotsClient };
}

/** A computer: its folder in memory and its record of the last sync. */
function computer(api: ScreenshotsClient) {
  const files = new Map<string, string>();
  let index: ScreenshotIndex = {};
  const folder: ScreenshotFolder = {
    list: async () => [...files].map(([name, data]) => ({ name, hash: data })),
    read: async (name) => bytes(files.get(name) ?? ''),
    write: async (name, data) => void files.set(name, text(data)),
    remove: async (name) => void files.delete(name),
    rename: async (from, to) => {
      files.set(to, files.get(from) ?? '');
      files.delete(from);
    },
  };
  return {
    files,
    sync: () => syncScreenshots(folder, api, index, (saved) => (index = saved)),
  };
}

describe('the sync of screenshots', () => {
  it('brings a new file to the other computer, then a change, then a deletion', async () => {
    const { api, shots } = fakeServer();
    const home = computer(api);
    const work = computer(api);

    home.files.set('2026-10/a.png', 'red');
    await home.sync();
    await work.sync();
    expect(work.files.get('2026-10/a.png')).toBe('red');

    work.files.set('2026-10/a.png', 'red+arrow');
    await work.sync();
    await home.sync();
    expect(home.files.get('2026-10/a.png')).toBe('red+arrow');
    expect(shots.size).toBe(1);

    home.files.delete('2026-10/a.png');
    await home.sync();
    await work.sync();
    expect(work.files.size).toBe(0);
    expect(shots.size).toBe(0);
    // Nothing more to do on either side.
    expect((await home.sync()).steps + (await work.sync()).steps).toBe(0);
  });

  it('keeps both versions of a file changed on two computers', async () => {
    const { api } = fakeServer();
    const home = computer(api);
    const work = computer(api);
    home.files.set('a.png', 'v1');
    await home.sync();
    await work.sync();

    home.files.set('a.png', 'home');
    work.files.set('a.png', 'work');
    await home.sync();
    // Both changed: work keeps the server's version beside its own, and sends both up…
    await work.sync();
    await home.sync();
    await work.sync();
    // …and home gets the copy on its next sync.
    await home.sync();

    const versions = (files: Map<string, string>) => [...files.values()].sort();
    expect(versions(work.files)).toEqual(['home', 'work']);
    expect(versions(home.files)).toEqual(versions(work.files));
  });

  it('never empties the server because a folder is gone', async () => {
    const { api, shots } = fakeServer();
    const home = computer(api);
    for (let number = 0; number < 12; number++) {
      home.files.set(`${number}.png`, `shot ${number}`);
    }
    await home.sync();
    home.files.clear();
    await expect(home.sync()).rejects.toBeInstanceOf(ScreenshotSyncStopped);
    expect(shots.size).toBe(12);
  });

  it('moves a file aside when the same name means another one on the server', async () => {
    const { api } = fakeServer();
    const home = computer(api);
    const work = computer(api);
    home.files.set('a.png', 'home');
    work.files.set('a.png', 'work');
    await home.sync();
    await work.sync();
    await home.sync();

    expect(work.files.get('a.png')).toBe('home');
    expect([...work.files.values()].sort()).toEqual(['home', 'work']);
    expect([...home.files.values()].sort()).toEqual(['home', 'work']);
  });
});
