import { compareFingerprints } from './reconcile';

describe('compareFingerprints', () => {
  it('reports tables whose hashes differ, with the row counts of both sides', () => {
    const local = {
      birthdays: { rows: 3, hash: 'a' },
      diary_entries: { rows: 10, hash: 'b' },
      projects: { rows: 2, hash: 'c' },
    };
    const server = {
      birthdays: { rows: 3, hash: 'a' },
      diary_entries: { rows: 10, hash: 'x' },
      projects: { rows: 1, hash: 'd' },
    };
    expect(compareFingerprints(local, server)).toEqual([
      { table: 'diary_entries', localRows: 10, serverRows: 10 },
      { table: 'projects', localRows: 2, serverRows: 1 },
    ]);
  });

  it('a table on one side only is a mismatch', () => {
    expect(compareFingerprints({}, { habits: { rows: 0, hash: '' } })).toEqual([
      { table: 'habits', localRows: null, serverRows: 0 },
    ]);
  });

  it('the same data — nothing to report', () => {
    const same = { users: { rows: 1, hash: 'h' } };
    expect(compareFingerprints(same, { ...same })).toEqual([]);
  });
});
