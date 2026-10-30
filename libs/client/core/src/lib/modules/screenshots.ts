import {nextFreeName, Screenshot} from '@pd/contracts';
import {ApiClient, apiRequest} from '../api-client';

const BASE = '/api/screenshots';

export const SCREENSHOTS_READS = {
  /** Every screenshot, newest first, without the files. */
  list: () => apiRequest(BASE),
};

export function screenshotsApi(api: ApiClient) {
  return {
    list: () => api.read<Screenshot[]>(SCREENSHOTS_READS.list()),
    /** A new one; the answer tells the name it got (a taken one becomes `name (2).png`). */
    add: (name: string, file: Blob) => {
      const form = new FormData();
      form.append('name', name);
      form.append('file', file, name.split('/').pop());
      return api.post<Screenshot>(BASE, form);
    },
    replace: (id: string, name: string, file: Blob) => {
      const form = new FormData();
      form.append('file', file, name.split('/').pop());
      return api.put<Screenshot>(`${BASE}/${id}`, form);
    },
    file: (id: string) => api.blob(`${BASE}/${id}/file`),
    thumbnail: (id: string) => api.blob(`${BASE}/${id}/thumbnail`),
    remove: (id: string) => api.delete(`${BASE}/${id}`),
  };
}

export type ScreenshotsClient = ReturnType<typeof screenshotsApi>;

// --- The sync of a folder with the server ---

/** A file in the folder of a device. */
export interface LocalScreenshot {
  name: string;
  /** SHA-256, hex, as the server tells it. */
  hash: string;
}

/** What the last sync left a file as: the screenshot it is on the server, and its hash then. */
export interface SyncedScreenshot {
  id: string;
  hash: string;
}

/** The record of the last sync of a folder: by the name in the folder. */
export type ScreenshotIndex = Record<string, SyncedScreenshot>;

export type SyncStep =
  /** New in the folder. */
  | {kind: 'upload'; name: string}
  /** Changed in the folder only. */
  | {kind: 'replace'; name: string; id: string}
  /**
   * The server's file into the folder as `as`. `keep` — it is that screenshot from now on;
   * a copy kept beside a file changed on both sides is not, and goes up as a new one next time.
   */
  | {kind: 'download'; id: string; hash: string; as: string; keep: boolean}
  /** A file of the folder moves aside: its name is the server's for another file. */
  | {kind: 'rename-local'; from: string; to: string}
  /** Deleted on the server, unchanged here. */
  | {kind: 'delete-local'; name: string}
  /** Deleted here. */
  | {kind: 'delete-server'; name: string; id: string}
  /** No longer synced under this name. */
  | {kind: 'forget'; name: string};

/**
 * A synced file that is both in the folder and on the server: what changed where since the last
 * sync (`entry`).
 */
function syncBoth(
  name: string,
  entry: ScreenshotIndex[string],
  file: LocalScreenshot,
  shot: Screenshot,
  free: (name: string) => string,
): SyncStep[] {
  const download = (as: string, keep: boolean): SyncStep => ({
    kind: 'download',
    id: shot.id,
    hash: shot.hash,
    as,
    keep,
  });
  if (file.hash === shot.hash) {
    // Changed the same way on both sides: only the record is behind (nothing is fetched).
    return file.hash === entry.hash ? [] : [download(name, true)];
  }
  const changedHere = file.hash !== entry.hash;
  const changedThere = shot.hash !== entry.hash;
  if (changedHere && changedThere) {
    return [download(free(name), false), {kind: 'replace', name, id: shot.id}];
  }
  return changedHere
    ? [{kind: 'replace', name, id: shot.id}]
    : [download(name, true)];
}

/**
 * What to do to make a folder and the server the same, by what changed on each side since the
 * last sync (`index`). Nothing is lost: a file changed on both sides is kept twice, and a file
 * whose name the server gives to another one moves aside.
 */
function planSync(
  local: LocalScreenshot[],
  server: Screenshot[],
  index: ScreenshotIndex,
): SyncStep[] {
  const here = new Map(local.map(file => [file.name, file]));
  const there = new Map(server.map(shot => [shot.id, shot]));
  const known = new Set(Object.values(index).map(entry => entry.id));
  const taken = new Set([...here.keys(), ...server.map(shot => shot.name)]);
  const free = (name: string) => {
    const found = nextFreeName(name, candidate => taken.has(candidate));
    taken.add(found);
    return found;
  };
  const steps: SyncStep[] = [];
  /** Local files whose upload is planned already (or that are the server's now). */
  const handled = new Set<string>();

  for (const [name, entry] of Object.entries(index)) {
    const file = here.get(name);
    const shot = there.get(entry.id);
    handled.add(name);
    if (!file && !shot) {
      steps.push({kind: 'forget', name});
    } else if (!shot && file) {
      if (file.hash === entry.hash) {
        steps.push({kind: 'delete-local', name});
      } else {
        // Deleted on the server but changed here meanwhile: kept, as a new one.
        steps.push({kind: 'forget', name}, {kind: 'upload', name});
      }
    } else if (shot && !file) {
      steps.push({kind: 'delete-server', name, id: entry.id});
    } else if (shot && file) {
      steps.push(...syncBoth(name, entry, file, shot, free));
    }
  }

  for (const shot of server) {
    if (known.has(shot.id)) {
      continue;
    }
    const same = here.get(shot.name);
    if (same && same.hash !== shot.hash && !index[shot.name]) {
      // Another file under this name here: it moves aside and goes up as a new one.
      const aside = free(shot.name);
      steps.push(
        {kind: 'rename-local', from: shot.name, to: aside},
        {kind: 'upload', name: aside},
      );
    }
    handled.add(shot.name);
    steps.push({
      kind: 'download',
      id: shot.id,
      hash: shot.hash,
      as: shot.name,
      keep: true,
    });
  }

  for (const file of local) {
    if (!handled.has(file.name)) {
      steps.push({kind: 'upload', name: file.name});
    }
  }
  return steps;
}

/** More deletions than this at once, and more than half of all, wait for the person. */
const MAX_QUIET_DELETIONS = 10;

/** A sync that would delete most of the screenshots on the server: not done. */
export class ScreenshotSyncStopped extends Error {
  constructor(readonly deletions: number) {
    super(
      `The folder lost ${deletions} screenshots at once: the server keeps them`,
    );
  }
}

/** What a device does with its folder of screenshots (the desktop app's bridge). */
export interface ScreenshotFolder {
  list(): Promise<LocalScreenshot[]>;
  read(name: string): Promise<Uint8Array>;
  write(name: string, data: Uint8Array): Promise<void>;
  remove(name: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
}

/**
 * One sync of a folder with the server, the plan carried out step by step: the index is saved
 * after every step, so a sync cut in the middle goes on from there next time.
 */
export async function syncScreenshots(
  folder: ScreenshotFolder,
  api: ScreenshotsClient,
  index: ScreenshotIndex,
  save: (index: ScreenshotIndex) => void,
): Promise<{steps: number}> {
  const local = await folder.list();
  const server = await api.list();
  const steps = planSync(local, server, index);
  const deletions = steps.filter(step => step.kind === 'delete-server').length;
  if (deletions > MAX_QUIET_DELETIONS && deletions > server.length / 2) {
    // A folder gone or emptied by mistake (a drive not plugged in) must not empty the server.
    throw new ScreenshotSyncStopped(deletions);
  }
  const hashes = new Map(local.map(file => [file.name, file.hash]));
  const next: ScreenshotIndex = {...index};
  const blob = async (name: string) =>
    new Blob([new Uint8Array(await folder.read(name))], {type: mimeOf(name)});

  for (const step of steps) {
    switch (step.kind) {
      case 'forget':
        delete next[step.name];
        break;
      case 'delete-local':
        await folder.remove(step.name);
        delete next[step.name];
        break;
      case 'delete-server':
        await api.remove(step.id);
        delete next[step.name];
        break;
      case 'rename-local':
        await folder.rename(step.from, step.to);
        hashes.set(step.to, hashes.get(step.from) ?? '');
        hashes.delete(step.from);
        break;
      case 'upload': {
        const shot = await api.add(step.name, await blob(step.name));
        if (shot.name !== step.name) {
          // The name was taken on the server (another computer, the same second).
          await folder.rename(step.name, shot.name);
        }
        next[shot.name] = {id: shot.id, hash: shot.hash};
        break;
      }
      case 'replace': {
        const shot = await api.replace(
          step.id,
          step.name,
          await blob(step.name),
        );
        next[step.name] = {id: shot.id, hash: shot.hash};
        break;
      }
      case 'download':
        if (hashes.get(step.as) !== step.hash) {
          const file = await api.file(step.id);
          await folder.write(step.as, new Uint8Array(await file.arrayBuffer()));
          hashes.set(step.as, step.hash);
        }
        if (step.keep) {
          next[step.as] = {id: step.id, hash: step.hash};
        }
        break;
    }
    save(next);
  }
  return {steps: steps.length};
}

function mimeOf(name: string): string {
  const extension = name.split('.').pop()?.toLowerCase();
  return extension === 'png'
    ? 'image/png'
    : extension === 'webp'
      ? 'image/webp'
      : 'image/jpeg';
}
