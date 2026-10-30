import {describe, expect, it} from 'vitest';
import {
  InputDynamics,
  InputFieldContext,
  SafeInputKind,
} from './input-dynamics';
import {ContextSwitches} from './context-switch';
import {TerminalCompletion, TerminalFriction} from './terminal-friction';

describe('input dynamics', () => {
  it('counts input, population pause variance and consecutive backspace bursts without raw events', () => {
    const input = new InputDynamics();
    input.observe('input', 0, 'public-editable');
    input.observe('input', 1000, 'public-editable');
    input.observe('input', 4000, 'public-editable');
    input.observe('backspace', 4100, 'public-editable');
    input.observe('backspace', 4200, 'public-editable');
    input.observe('backspace', 4300, 'public-editable');
    input.observe('input', 4400, 'public-editable');
    input.observe('backspace', 4500, 'public-editable');
    input.observe('backspace', 4600, 'public-editable');
    expect(input.metrics()).toEqual({
      inputCount: 4,
      backspaceCount: 5,
      backspaceBursts: 2,
      pauseMeanMs: 2000,
      pauseVarianceMs2: 1_000_000,
    });
    expect(JSON.stringify(input)).not.toContain('public-editable');
  });

  it.each(['password', 'private', 'unknown', undefined])(
    'fails closed for %s fields',
    field => {
      const input = new InputDynamics();
      expect(input.observe('input', 0, field as InputFieldContext)).toBe(false);
      expect(input.metrics()).toEqual({});
    },
  );

  it('refuses raw keys and invalid timestamps and does not bridge denied input', () => {
    const input = new InputDynamics();
    expect(input.observe('secret' as SafeInputKind, 0, 'public-editable')).toBe(
      false,
    );
    expect(input.observe('input', NaN, 'public-editable')).toBe(false);
    input.observe('backspace', 0, 'public-editable');
    input.observe('input', 100, 'password');
    input.observe('backspace', 200, 'public-editable');
    expect(input.metrics()).toEqual({
      inputCount: 0,
      backspaceCount: 2,
      backspaceBursts: 0,
    });
    expect(JSON.stringify(input)).not.toContain('secret');
  });
});

describe('sampled focus', () => {
  it('computes duration-weighted entropy and app changes without exposing names', () => {
    const context = new ContextSwitches();
    context.sample('editor', 0);
    context.sample('browser', 5000);
    const metrics = context.finish(10_000);
    expect(metrics).toEqual({
      contextSwitches: 1,
      focusSeconds: 10,
      focusEntropy: 1,
      uniqueApps: 2,
    });
    expect(JSON.stringify(metrics)).not.toMatch(/editor|browser/);
  });

  it('does not attribute missing or backward samples as focus time', () => {
    const context = new ContextSwitches();
    context.sample('editor', 0);
    context.sample('browser', 60_000);
    expect(context.finish(59_000).focusSeconds).toBe(0);
  });
});

describe('explicit terminal reports', () => {
  const report: TerminalCompletion = {
    exitCode: 0,
    durationMs: 500,
    kind: 'build',
    context: 'public-terminal',
  };

  it('only aggregates statuses and build durations', () => {
    const terminal = new TerminalFriction();
    terminal.report(report);
    terminal.report({...report, exitCode: 1, kind: 'command'});
    expect(terminal.metrics()).toEqual({
      terminalCommands: 2,
      terminalFailures: 1,
      buildWaitMs: 500,
    });
  });

  it.each([
    {...report, command: 'secret'},
    {...report, stdout: 'secret'},
    {...report, durationMs: NaN},
    {...report, durationMs: -1},
    {...report, durationMs: Infinity},
    {...report, exitCode: 0.5},
    {...report, context: 'unknown'},
    {...report, kind: 'secret'},
  ])('rejects unsafe or malformed reports before aggregation: %j', value => {
    const terminal = new TerminalFriction();
    expect(terminal.report(value as TerminalCompletion)).toBe(false);
    expect(terminal.metrics()).toEqual({});
    expect(JSON.stringify(terminal)).not.toContain('secret');
  });
});
