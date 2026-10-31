import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import {mkdir, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ArchiveSink, FolderWriter} from './data-archive';
import {folderName, OpenExportService} from './open-export.service';

describe('the open copy', () => {
  let folder: string;

  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), 'pd-open-export-'));
  });

  afterEach(() => rmSync(folder, {recursive: true, force: true}));

  it("names a user's folder by the address, or by the id", () => {
    expect(folderName('Roman.R@example.com', 'id-1')).toBe('roman.r');
    expect(folderName('..@example.com', 'id-1')).toBe('id-1');
    expect(folderName('@example.com', 'id-1')).toBe('id-1');
  });

  it('writes the files of an archive into folders', async () => {
    const writer = new FolderWriter(join(folder, 'me'));
    await writer.file('data/tasks.jsonl', async push => {
      await push('{"id":1}\n');
      await push(new Uint8Array([0x7b, 0x7d, 0x0a]));
    });
    await writer.file('diary/2026-10-31.md', push => push('# Day'));
    await writer.end();
    expect(readFileSync(join(folder, 'me/data/tasks.jsonl'), 'utf8')).toBe(
      '{"id":1}\n{}\n',
    );
    expect(readFileSync(join(folder, 'me/diary/2026-10-31.md'), 'utf8')).toBe(
      '# Day',
    );
  });

  it('puts the new copy in place of the old one, for every user', async () => {
    await mkdir(join(folder, 'roman/stale'), {recursive: true});
    await writeFile(join(folder, 'roman/stale/old.txt'), 'old');
    const people = [
      {id: 'u1', email: 'roman@example.com'},
      {id: 'u2', email: 'roman@other.org'},
    ];
    const service = new OpenExportService(
      {get: () => folder} as never,
      {select: () => ({from: async () => people})} as never,
      {
        writeInto: async (userId: string, sink: ArchiveSink) => {
          await sink.file('manifest.json', push =>
            push(`{"user":"${userId}"}`),
          );
          await sink.end();
        },
      } as never,
      {register: () => undefined} as never,
      {mode: 'off'} as never,
    );

    await service.writeAll();

    expect(readdirSync(folder).sort()).toEqual(['roman', 'u2']);
    expect(existsSync(join(folder, 'roman/stale'))).toBe(false);
    expect(readFileSync(join(folder, 'roman/manifest.json'), 'utf8')).toBe(
      '{"user":"u1"}',
    );
  });
});
