import { DiskReport, diskReportSchema } from '@pd/contracts';
import { parseAdvice } from './disk-advice.service';
import { fixOf, mustNotTrash, ruleAdvice } from './disk-rules';

const GB = 1024 ** 3;
const report: DiskReport = {
  mount: 'C:',
  total: 200 * GB,
  free: 8 * GB,
  folders: [
    { path: 'C:\\Windows', bytes: 30 * GB, files: 1, modifiedAt: null },
    {
      path: '%USERPROFILE%\\projects\\old\\node_modules',
      bytes: 2 * GB,
      files: 1,
      modifiedAt: null,
    },
  ],
  files: [
    {
      path: '%USERPROFILE%\\AppData\\Local\\Packages\\Ubuntu\\LocalState\\ext4.vhdx',
      bytes: 40 * GB,
      modifiedAt: null,
    },
  ],
  known: [
    { place: 'temp', path: '%USERPROFILE%\\AppData\\Local\\Temp', bytes: 3 * GB },
    { place: 'npm-cache', path: '%USERPROFILE%\\AppData\\Local\\npm-cache', bytes: GB },
    {
      place: 'crash-dumps',
      path: '%USERPROFILE%\\AppData\\Local\\CrashDumps',
      bytes: 10 * 1024 ** 2,
    },
  ],
};

describe('mustNotTrash', () => {
  it('keeps the system, virtual disks and the top folders of the user', () => {
    expect(mustNotTrash('C:\\Windows\\Temp')).toBe(true);
    expect(mustNotTrash('C:\\Program Files (x86)\\Steam')).toBe(true);
    expect(
      mustNotTrash('%USERPROFILE%\\AppData\\Local\\Packages\\Ubuntu\\LocalState\\ext4.vhdx'),
    ).toBe(true);
    expect(mustNotTrash('%USERPROFILE%\\Downloads')).toBe(true);
    expect(mustNotTrash('C:\\pagefile.sys')).toBe(true);
    expect(mustNotTrash('C:')).toBe(true);
  });

  it('lets caches and old builds go', () => {
    expect(mustNotTrash('%USERPROFILE%\\AppData\\Local\\Temp')).toBe(false);
    expect(mustNotTrash('%USERPROFILE%\\Downloads\\setup.exe')).toBe(false);
    expect(mustNotTrash('%USERPROFILE%\\projects\\old\\node_modules')).toBe(false);
  });
});

describe('ruleAdvice', () => {
  it('advises on the known places worth it, biggest first', () => {
    const advice = ruleAdvice(report);
    expect(advice.map((item) => [item.path.split('\\').pop(), item.action, item.how])).toEqual([
      ['Temp', 'trash', null],
      ['npm-cache', 'command', 'npm cache clean --force'],
    ]);
  });
});

describe('parseAdvice', () => {
  it('keeps only paths of the report and never trashes a protected one', () => {
    const answer = `Here you go:
\`\`\`json
{"summary": "Mostly WSL.", "suggestions": [
  {"path": "%USERPROFILE%\\\\AppData\\\\Local\\\\Packages\\\\Ubuntu\\\\LocalState\\\\ext4.vhdx", "action": "trash", "safety": "safe", "reason": "big"},
  {"path": "C:\\\\Users\\\\someone\\\\secret", "action": "trash", "safety": "safe", "reason": "invented"},
  {"path": "%USERPROFILE%\\\\projects\\\\old\\\\node_modules", "action": "trash", "safety": "check", "reason": "old build", "how": null},
  {"path": "C:\\\\Windows", "action": "explode", "safety": "??", "reason": "system"}
]}
\`\`\``;
    const advice = parseAdvice(answer, report);
    expect(advice?.byAi).toBe(true);
    expect(advice?.summary).toBe('Mostly WSL.');
    expect(
      advice?.suggestions.map((item) => [item.path.split('\\').pop(), item.action, item.safety]),
    ).toEqual([
      ['ext4.vhdx', 'review', 'safe'],
      ['Windows', 'review', 'check'],
      ['node_modules', 'trash', 'check'],
    ]);
  });

  it('gives up on an answer that is not JSON', () => {
    expect(parseAdvice('I cannot help with that.', report)).toBeNull();
  });
});

describe('fixes', () => {
  it('gives the app its own cleanup for a known place, never for anything else', () => {
    expect(fixOf(report, '%USERPROFILE%\\AppData\\Local\\npm-cache')).toBe('npm-cache');
    expect(fixOf(report, '%USERPROFILE%\\AppData\\Local\\Temp')).toBeNull();
    expect(fixOf(report, '%USERPROFILE%\\projects\\old\\node_modules')).toBeNull();
    expect(ruleAdvice(report).map((item) => item.fix)).toEqual([null, 'npm-cache']);
  });

  it('attaches the fix to the advice of the AI by the path, not by what the AI says', () => {
    const answer = JSON.stringify({
      summary: 'npm',
      suggestions: [
        {
          path: '%USERPROFILE%\\AppData\\Local\\npm-cache',
          action: 'command',
          safety: 'safe',
          reason: 'r',
          fix: 'docker-prune',
        },
      ],
    });
    expect(parseAdvice(answer, report)?.suggestions[0].fix).toBe('npm-cache');
  });
});

describe('diskReportSchema', () => {
  it('takes the other disks of the computer', () => {
    const result = diskReportSchema.safeParse({
      ...report,
      otherDisks: [{ mount: 'D:', total: 256 * GB, free: 187 * GB }],
    });
    expect(result.success).toBe(true);
  });
});
