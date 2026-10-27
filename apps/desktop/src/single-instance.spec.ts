import { describe, expect, it, vi } from 'vitest';
import { listsProcess } from './single-instance';

vi.mock('electron', () => ({ app: { getPath: () => 'unused-test-path' } }));

describe('listsProcess', () => {
  const tasklist = '"Personal Dashboard.exe","8124","Console","1","182 340 K"\r\n';

  it('finds a running copy of the app by its id', () => {
    expect(listsProcess(tasklist, 8124, 'Personal Dashboard.exe')).toBe(true);
    expect(listsProcess(tasklist, 8124, 'personal dashboard.EXE')).toBe(true);
  });

  it('does not take another program with a reused id, or an id that only starts the same', () => {
    expect(
      listsProcess('"notepad.exe","8124","Console","1","9 000 K"', 8124, 'Personal Dashboard.exe'),
    ).toBe(false);
    expect(listsProcess(tasklist, 812, 'Personal Dashboard.exe')).toBe(false);
    expect(
      listsProcess(
        'INFO: No tasks are running which match the specified criteria.',
        8124,
        'Personal Dashboard.exe',
      ),
    ).toBe(false);
  });
});
