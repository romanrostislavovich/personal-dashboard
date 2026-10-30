import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {TelemetrySources} from './telemetry-sources';

const mocks = vi.hoisted(() => ({spawn: vi.fn(), write: vi.fn()}));
vi.mock('electron', () => ({app: {getPath: () => 'C:\\test-user-data'}}));
vi.mock('node:child_process', () => ({spawn: mocks.spawn}));
vi.mock('node:fs', () => ({
  readFileSync: () => '# bundled helper',
  writeFileSync: mocks.write,
}));

function child() {
  return Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    kill: vi.fn(),
  });
}

const gate = {
  identity: 'server/device/secret',
  privateWords: ['private'],
  excludedApps: ['excluded'],
  idleMs: 300_000,
};
const input = {
  inputCount: 2,
  backspaceCount: 0,
  backspaceBursts: 0,
  pauses: 0,
  pauseMeanMs: 0,
  pauseM2: 0,
};

describe('telemetry helper lifecycle', () => {
  const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    Object.defineProperty(process, 'platform', {value: 'win32'});
    mocks.spawn.mockReset();
    mocks.write.mockClear();
  });
  afterEach(() => {
    Object.defineProperty(process, 'platform', platform);
    vi.useRealTimers();
  });

  it('starts only with a gate, sends no account credentials and forwards only whitelisted records', () => {
    const process = child();
    mocks.spawn.mockReturnValue(process);
    const onInput = vi.fn();
    const onTerminal = vi.fn();
    const sources = new TelemetrySources(onInput, onTerminal);
    sources.update(null);
    expect(mocks.spawn).not.toHaveBeenCalled();
    sources.update(gate);
    expect(mocks.spawn).toHaveBeenCalledOnce();
    expect(mocks.spawn.mock.calls[0][2]).toEqual({
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    expect(process.stdin.read().toString()).not.toContain('secret');
    expect(mocks.write).toHaveBeenCalledTimes(3);
    process.stdout.write(JSON.stringify({input}) + '\n');
    process.stdout.write(
      JSON.stringify({
        terminal: {durationMs: 100, exitCode: 0, category: 'test'},
      }) + '\n',
    );
    process.stdout.write(
      JSON.stringify({input: {...input, text: 'secret'}}) + '\n',
    );
    process.stdout.write(
      JSON.stringify({
        terminal: {
          durationMs: 100,
          exitCode: 0,
          category: 'test',
          command: 'secret',
        },
      }) + '\n',
    );
    process.stdout.write('invalid\n');
    expect(onInput).toHaveBeenCalledExactlyOnceWith(input);
    expect(onTerminal).toHaveBeenCalledOnce();
    sources.update(null);
    expect(process.kill).toHaveBeenCalledOnce();
    expect(process.stdin.destroyed).toBe(true);
    process.stdout.write(JSON.stringify({input}) + '\n');
    expect(onInput).toHaveBeenCalledOnce();
    process.emit('exit');
  });

  it('isolates replacement children and recovers from process errors with backoff', () => {
    const first = child();
    const second = child();
    mocks.spawn.mockReturnValueOnce(first).mockReturnValueOnce(second);
    const onInput = vi.fn();
    const sources = new TelemetrySources(onInput, vi.fn());
    sources.update(gate);
    first.emit('error', new Error('blocked'));
    sources.update(gate);
    expect(mocks.spawn).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(30_000);
    sources.update({...gate, identity: 'new-account'});
    expect(mocks.spawn).toHaveBeenCalledTimes(2);
    first.emit('exit');
    first.stdout.write(JSON.stringify({input}) + '\n');
    second.stdout.write(JSON.stringify({input}) + '\n');
    expect(onInput).toHaveBeenCalledOnce();
    expect(second.kill).not.toHaveBeenCalled();
    sources.stop();
    second.emit('exit');
  });
});
