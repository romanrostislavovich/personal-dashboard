import { describe, expect, it } from 'vitest';
import {
  telemetryQuerySchema,
  workstateInputSchema,
  workstateProjectPathSchema,
  workstateQuerySchema,
  workstateRestorePlanSchema,
  workstateRestoreRequestSchema,
} from './workstates';

const id = '8aac7fc0-8b2c-4afd-9c72-95a934eb5413';
const input = { id, capturedAt: '2026-10-21T10:00:00Z', capture: { browserUrls: [] } };

describe('workstate contracts', () => {
  it('accepts explicit captures and rejects identities, commands and key logs at every level', () => {
    expect(workstateInputSchema.parse(input)).toEqual(input);
    for (const key of ['userId', 'deviceId', 'commands', 'keyLog']) {
      expect(workstateInputSchema.safeParse({ ...input, [key]: 'x' }).success).toBe(false);
      expect(
        workstateInputSchema.safeParse({ ...input, capture: { ...input.capture, [key]: 'x' } })
          .success,
      ).toBe(false);
    }
    expect(workstateInputSchema.safeParse({ ...input, capture: {} }).success).toBe(false);
    expect(
      workstateInputSchema.safeParse({
        ...input,
        capture: { browserUrls: Array(21).fill('https://example.com/') },
      }).success,
    ).toBe(false);
  });

  it('bounds pagination, pairs cursor fields and checks chronological ranges', () => {
    for (const schema of [workstateQuerySchema, telemetryQuerySchema]) {
      expect(schema.parse({ limit: '100' }).limit).toBe(100);
      expect(schema.parse({}).limit).toBe(50);
      for (const query of [
        { limit: 101 },
        { limit: 0 },
        { limit: true },
        { limit: [1] },
        { beforeId: id },
        { before: input.capturedAt },
        { from: '2026-10-22T00:00:00Z', to: input.capturedAt },
        { userId: id },
      ]) {
        expect(schema.safeParse(query).success).toBe(false);
      }
    }
  });

  it('only permits confirmation-required declarative restore actions', () => {
    const plan = {
      workstateId: id,
      requiresConfirmation: true,
      actions: [
        { kind: 'openUrl', url: 'https://example.com/docs' },
        { kind: 'openProject', path: 'C:\\work\\dashboard' },
        { kind: 'reference', field: 'gitBranch', text: 'feature/workstates' },
      ],
    };
    expect(workstateRestorePlanSchema.safeParse(plan).success).toBe(true);
    for (const action of [
      { kind: 'shell', command: 'git checkout main' },
      { kind: 'checkout', branch: 'main' },
      { kind: 'openUrl', url: 'javascript:alert(1)' },
      { kind: 'openUrl', url: 'https://example.com/?token=abc' },
      { kind: 'reference', field: 'note', text: 'token=abc' },
      { kind: 'openProject', path: '/work/project', command: 'echo hi' },
    ])
      expect(workstateRestorePlanSchema.safeParse({ ...plan, actions: [action] }).success).toBe(
        false,
      );
    expect(
      workstateRestorePlanSchema.safeParse({ ...plan, requiresConfirmation: false }).success,
    ).toBe(false);
    expect(workstateRestoreRequestSchema.safeParse({ execute: true }).success).toBe(false);
  });

  it('rejects shell-like, relative, traversal and network project targets', () => {
    for (const path of [
      '../project',
      '~/project',
      '/work/../private',
      '//server/share',
      '\\\\server\\share',
      '/work;echo bad',
      '/work/$(id)',
      'C:\\work\\..\\private',
      '/work\n/run',
      '/work/token',
      '/\\server\\share',
    ]) {
      expect(workstateProjectPathSchema.safeParse(path).success, path).toBe(false);
    }
    expect(workstateProjectPathSchema.safeParse('/work/dashboard').success).toBe(true);
  });
});
