import { ComputerFacts, computerProblems } from './computer-security';
import { computerSecurityMessages } from './computer-security.messages';

const text = computerSecurityMessages('en');
const now = new Date('2026-10-05T12:00:00Z');

const healthy: ComputerFacts = {
  id: 'pc',
  name: 'LRR',
  platform: 'win32',
  reportedAt: '2026-10-05T11:55:00Z',
  os: null,
  antivirus: { enabled: true, realtime: true, signatureAgeDays: 0 },
  protection: {
    firewall: [
      { profile: 'Private', enabled: true },
      { profile: 'Public', enabled: true },
    ],
    diskEncrypted: true,
    daysSinceUpdate: 2,
    restartPending: false,
    locksWhenIdle: true,
    uac: true,
  },
};

describe('computerProblems', () => {
  it('finds nothing on a protected computer', () => {
    expect(computerProblems(healthy, text, now)).toEqual([]);
  });

  it('grades what it finds, each under the computer’s own key', () => {
    const problems = computerProblems(
      {
        ...healthy,
        antivirus: { enabled: true, realtime: false, signatureAgeDays: 30 },
        protection: {
          firewall: [
            { profile: 'Private', enabled: true },
            { profile: 'Public', enabled: false },
          ],
          diskEncrypted: false,
          daysSinceUpdate: 80,
          restartPending: true,
          locksWhenIdle: false,
          uac: false,
        },
      },
      text,
      now,
    );
    expect(Object.fromEntries(problems.map((p) => [p.key, p.severity]))).toEqual({
      'pc.antivirus-off': 'high',
      'pc.firewall-off': 'high',
      'pc.not-encrypted': 'low',
      'pc.updates-old': 'medium',
      'pc.restart-pending': 'low',
      'pc.no-idle-lock': 'info',
      'pc.uac-off': 'medium',
    });
    expect(problems.find((p) => p.key === 'pc.firewall-off')?.details).toContain('Public');
  });

  it('tells old definitions only while the antivirus is on', () => {
    const old = { ...healthy, antivirus: { enabled: true, realtime: true, signatureAgeDays: 9 } };
    expect(computerProblems(old, text, now).map((p) => p.key)).toEqual(['pc.signatures-old']);
  });

  it('claims nothing about an older shell that does not report protection', () => {
    expect(computerProblems({ ...healthy, protection: null }, text, now)).toEqual([]);
  });

  it('reports only the silence of a computer not heard from for long', () => {
    const silent = {
      ...healthy,
      reportedAt: '2026-09-01T00:00:00Z',
      antivirus: { enabled: false, realtime: false, signatureAgeDays: 90 },
    };
    expect(computerProblems(silent, text, now).map((p) => p.key)).toEqual(['pc.silent']);
    expect(computerProblems({ ...healthy, reportedAt: null }, text, now)).toEqual([]);
  });
});
