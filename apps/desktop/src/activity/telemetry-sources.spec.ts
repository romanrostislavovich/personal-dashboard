import {describe, expect, it, vi} from 'vitest';
import {InputDynamics, parseInputAggregate} from './input-dynamics';
import {parseTerminalReport} from './telemetry-sources';

vi.mock('electron', () => ({app: {}}));

const aggregate = {
  inputCount: 2,
  backspaceCount: 1,
  backspaceBursts: 0,
  pauses: 2,
  pauseMeanMs: 2000,
  pauseM2: 2_000_000,
};

describe('native telemetry boundary', () => {
  it('combines running moments, not averages of variances or raw key events', () => {
    const input = new InputDynamics();
    expect(input.merge(aggregate)).toBe(true);
    expect(
      input.merge({...aggregate, pauses: 1, pauseMeanMs: 5000, pauseM2: 0}),
    ).toBe(true);
    expect(input.metrics()).toEqual({
      inputCount: 4,
      backspaceCount: 2,
      backspaceBursts: 0,
      pauseMeanMs: 3000,
      pauseVarianceMs2: 8_000_000 / 3,
    });
  });

  it.each([
    null,
    {},
    {...aggregate, key: 'secret'},
    {...aggregate, inputCount: -1},
    {...aggregate, pauseM2: Infinity},
    {...aggregate, pauses: 0.5},
    {...aggregate, inputCount: 1001},
    {...aggregate, pauses: 0},
    {...aggregate, inputCount: '2'},
  ])('rejects invalid native aggregates before buffering: %j', value => {
    expect(parseInputAggregate(value)).toBeNull();
  });

  it.each(['build', 'test', 'commit', 'general'])(
    'accepts explicit %s completion',
    category => {
      expect(
        parseTerminalReport({category, durationMs: 500, exitCode: 0}),
      ).toEqual({
        category,
        durationMs: 500,
        exitCode: 0,
      });
    },
  );

  it.each([
    null,
    {},
    {category: 'unknown', durationMs: 10, exitCode: 0},
    {category: 'test', durationMs: -1, exitCode: 0},
    {category: 'test', durationMs: 300001, exitCode: 0},
    {category: 'test', durationMs: NaN, exitCode: 0},
    {category: 'test', durationMs: 100, exitCode: 0.1},
    {category: 'test', durationMs: 100, exitCode: 0, commandLine: 'secret'},
  ])('rejects malformed or text-bearing terminal reports: %j', value => {
    expect(parseTerminalReport(value)).toBeNull();
  });
});
