import { coverage, CoverageRow } from './finding-coverage';

const row = (id: string, changes: Partial<CoverageRow> = {}): CoverageRow => ({
  id,
  key: `server:${id}`,
  origin: 'rules',
  status: 'open',
  severity: 'medium',
  title: id,
  covers: [],
  ...changes,
});
const ai = (id: string, covers: string[], changes: Partial<CoverageRow> = {}): CoverageRow =>
  row(id, { key: `ai:${id}`, origin: 'ai', covers, ...changes });

describe('coverage', () => {
  it('folds the rules’ findings under the AI finding that covers them', () => {
    const result = coverage([
      row('ssh-password', { severity: 'high' }),
      row('firewall-off', { severity: 'high' }),
      row('reboot', { severity: 'low' }),
      ai('exposed', ['server:ssh-password', 'server:firewall-off'], { severity: 'critical' }),
    ]);
    expect(result.get('ssh-password')?.coveredBy).toBe('exposed');
    expect(result.get('firewall-off')?.coveredBy).toBe('exposed');
    expect(result.get('reboot')?.coveredBy).toBeNull();
    expect(result.get('exposed')).toEqual({
      severity: 'critical',
      coveredBy: null,
      covers: [
        { id: 'ssh-password', title: 'ssh-password', severity: 'high' },
        { id: 'firewall-off', title: 'firewall-off', severity: 'high' },
      ],
    });
  });

  it('never shows the AI finding milder than what it covers', () => {
    const result = coverage([
      row('ssh-password', { severity: 'high' }),
      ai('talked-down', ['server:ssh-password'], { severity: 'low' }),
    ]);
    expect(result.get('talked-down')?.severity).toBe('high');
  });

  it('keeps the rules’ findings folded while the owner ignores the AI one', () => {
    const result = coverage([
      row('ssh-password'),
      ai('exposed', ['server:ssh-password'], { status: 'ignored' }),
    ]);
    expect(result.get('ssh-password')?.coveredBy).toBe('exposed');
  });

  it('brings them back once the AI finding is gone, and ignores what is fixed', () => {
    const gone = coverage([
      row('ssh-password'),
      ai('exposed', ['server:ssh-password'], { status: 'resolved' }),
    ]);
    expect(gone.get('ssh-password')?.coveredBy).toBeNull();
    const fixed = coverage([
      row('ssh-password', { status: 'resolved' }),
      ai('exposed', ['server:ssh-password', 'server:never-existed']),
    ]);
    expect(fixed.get('exposed')?.covers).toEqual([]);
  });

  it('folds a finding under one AI finding only, and never an AI finding under another', () => {
    const result = coverage([
      row('ssh-password'),
      ai('first', ['server:ssh-password']),
      ai('second', ['server:ssh-password', 'ai:first']),
    ]);
    expect(result.get('ssh-password')?.coveredBy).toBe('first');
    expect(result.get('second')?.covers).toEqual([]);
    expect(result.get('first')?.coveredBy).toBeNull();
  });
});
