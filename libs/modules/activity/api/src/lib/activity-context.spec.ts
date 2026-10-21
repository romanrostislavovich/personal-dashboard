import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { TelemetryBucket, WorkstateInput, workstateRestorePlanSchema } from '@pd/contracts';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { ActivityContextController } from './activity-context.controller';
import {
  contextCutoff,
  restorePlan,
  sanitizeTelemetryPage,
  sanitizeWorkstate,
} from './activity-context.policy';
import { activityWorkstates, telemetryDynamics } from './activity-context.schema';
import { ActivityContextStore } from './activity-context.store';
import { DevicesService } from './devices.service';
import { TelemetryService } from './telemetry.service';
import { WorkstateService } from './workstate.service';

const userId = '8aac7fc0-8b2c-4afd-9c72-95a934eb5413';
const deviceId = '8aac7fc0-8b2c-4afd-9c72-95a934eb5414';
const capture = (): WorkstateInput => ({
  id: userId,
  capturedAt: new Date().toISOString(),
  capture: { browserUrls: [] },
});
const bucket = (): TelemetryBucket => ({
  id: userId,
  source: 'browser',
  startedAt: new Date(Date.now() - 60_000).toISOString(),
  endedAt: new Date().toISOString(),
  metrics: { copyCount: 2 },
});

describe('activity context privacy and schemas', () => {
  it('removes sensitive and user-private text, URLs and nonlocal project targets', () => {
    const safe = sanitizeWorkstate(
      {
        activeApp: 'WebStorm',
        windowTitle: 'Client\t Records',
        projectPath: '\\\\server\\share',
        gitBranch: 'token=abc',
        note: 'person@example.com',
        browserUrls: [
          'https://example.com/docs?q=secret#fragment',
          'https://example.com/account',
          'https://example.com/%62ank',
          'file:///home/user',
          'http://localhost/',
          'https://example.com/docs',
        ],
      },
      ['BANK', 'client records'],
    );
    expect(safe).toEqual({
      activeApp: 'WebStorm',
      windowTitle: undefined,
      projectPath: undefined,
      gitBranch: undefined,
      note: undefined,
      browserUrls: ['https://example.com/docs'],
    });
    expect(sanitizeTelemetryPage({ url: 'https://example.com/bank' }, ['bank'])).toBeUndefined();
    expect(
      sanitizeTelemetryPage(
        {
          url: 'https://example.com/docs',
          title: 'Private project',
          technologies: ['TypeScript', 'Private project'],
        },
        ['private'],
      ),
    ).toEqual({
      url: 'https://example.com/docs',
      title: undefined,
      type: undefined,
      technologies: ['TypeScript'],
    });
  });

  it('builds only a validated proposal, including branch as a reference rather than checkout', () => {
    const plan = restorePlan(userId, {
      activeApp: 'WebStorm',
      projectPath: '/work/dashboard',
      gitBranch: 'feature/context',
      browserUrls: ['https://example.com/docs'],
      note: 'Resume tests',
    });
    expect(workstateRestorePlanSchema.parse(plan)).toEqual(plan);
    expect(plan.actions.map((action) => action.kind)).toEqual([
      'openUrl',
      'openProject',
      'reference',
      'reference',
      'reference',
    ]);
    expect(plan.requiresConfirmation).toBe(true);
  });

  it('defines user-scoped primary keys and thirty-day retention', () => {
    for (const table of [activityWorkstates, telemetryDynamics]) {
      expect(getTableConfig(table).primaryKeys[0].columns.map((column) => column.name)).toEqual([
        'userId',
        'id',
      ]);
    }
    expect(contextCutoff(30 * 86_400_000).getTime()).toBe(0);
  });
});

describe('activity context service boundary', () => {
  const db = { insert: vi.fn(), select: vi.fn(), delete: vi.fn() };
  const context = {
    privateWords: vi.fn().mockResolvedValue([]),
    verifyDevice: vi.fn().mockRejectedValue(new UnauthorizedException()),
  };
  const telemetry = new TelemetryService(db as never, context as unknown as ActivityContextStore);
  const workstates = new WorkstateService(db as never, context as unknown as ActivityContextStore);
  beforeEach(() => vi.clearAllMocks());

  it('rejects invalid direct calls before any database access', async () => {
    for (const input of [
      { buckets: [{ ...bucket(), metrics: { keys: 'raw input' } }] },
      { buckets: Array(101).fill(bucket()) },
      { buckets: [{ ...bucket(), deviceId }] },
    ]) {
      await expect(telemetry.record(userId, input)).rejects.toBeInstanceOf(BadRequestException);
    }
    await expect(
      workstates.capture(userId, { ...capture(), capture: { browserUrls: [], command: 'ls' } }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(workstates.list(userId, { limit: 101 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(telemetry.list(userId, { beforeId: userId })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(workstates.get(userId, '../other')).rejects.toBeInstanceOf(BadRequestException);
    await expect(workstates.restore(userId, userId, { execute: true })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.select).not.toHaveBeenCalled();
  });

  it('enforces transport source, ownership, time bounds and stale replay retention', async () => {
    await expect(
      telemetry.record(userId, { buckets: [{ ...bucket(), source: 'desktop' }] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      telemetry.record(userId, { buckets: [bucket()] }, deviceId),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(workstates.capture(userId, capture(), deviceId)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(
      telemetry.record(userId, { buckets: [{ ...bucket(), source: 'desktop' }] }, deviceId),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    const old = new Date(Date.now() - 31 * 86_400_000).toISOString();
    await expect(
      workstates.capture(userId, { ...capture(), capturedAt: old }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      workstates.capture(userId, {
        ...capture(),
        capturedAt: new Date(Date.now() + 120_000).toISOString(),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(
      await telemetry.record(userId, {
        buckets: [
          {
            ...bucket(),
            startedAt: old,
            endedAt: new Date(Date.parse(old) + 60_000).toISOString(),
          },
        ],
      }),
    ).toEqual({ saved: 0 });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('authenticates device routes before invoking services and derives both IDs from the token', async () => {
    const devices = { authenticate: vi.fn().mockRejectedValue(new UnauthorizedException()) };
    const record = vi.fn();
    const save = vi.fn();
    const controller = new ActivityContextController(
      { record } as unknown as TelemetryService,
      { capture: save } as unknown as WorkstateService,
      devices as unknown as DevicesService,
    );
    await expect(controller.ingestTelemetry(undefined, { buckets: [] })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(controller.ingestWorkstate('Device bad', capture())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(record).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    devices.authenticate.mockResolvedValue({ id: deviceId, userId } as never);
    const input = capture();
    await controller.ingestWorkstate('Device verified', input);
    await controller.ingestTelemetry('Device verified', { buckets: [] });
    expect(save).toHaveBeenCalledWith(userId, input, deviceId);
    expect(record).toHaveBeenCalledWith(userId, { buckets: [] }, deviceId);
  });
});
