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
import {OpenExportService} from './open-export.service';

describe('the open copy', () => {
  let folder: string;

  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), 'pd-open-export-'));
  });

  afterEach(() => rmSync(folder, {recursive: true, force: true}));

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

  it("puts the owner's new copy in place of the old one, without credentials", async () => {
    const copy = join(folder, 'personal-dashboard/data');
    await mkdir(join(copy, 'stale'), {recursive: true});
    await writeFile(join(copy, 'stale/old.txt'), 'old');
    await mkdir(join(folder, 'mine'));
    const asked: unknown[] = [];
    const service = new OpenExportService(
      {get: () => folder} as never,
      {owner: async () => ({id: 'u1'})} as never,
      {
        writeInto: async (
          userId: string,
          sink: ArchiveSink,
          omit: Record<string, string[]>,
        ) => {
          asked.push(userId, omit);
          await sink.file('manifest.json', push => push('{}'));
          await sink.end();
        },
      } as never,
      {register: () => undefined} as never,
      {mode: 'off'} as never,
    );

    await service.writeAll();

    // Only its own folder: what else is in OPEN_EXPORT_DIR stays.
    expect(readdirSync(folder).sort()).toEqual(['mine', 'personal-dashboard']);
    expect(readdirSync(join(folder, 'personal-dashboard'))).toEqual(['data']);
    expect(existsSync(join(copy, 'stale'))).toBe(false);
    expect(readFileSync(join(copy, 'manifest.json'), 'utf8')).toBe('{}');
    expect(asked).toEqual(['u1', {finance_bank_connections: ['session_id']}]);
  });
});
