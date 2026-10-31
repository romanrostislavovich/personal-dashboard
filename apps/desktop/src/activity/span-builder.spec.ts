import {describe, expect, it} from 'vitest';
import {SpanBuilder, WindowSample} from './span-builder';

const editor: WindowSample = {
  app: 'code',
  name: 'VS Code',
  title: 'dashboard',
  fullscreen: false,
};
const browser: WindowSample = {...editor, app: 'chrome', name: 'Chrome'};
const at = (seconds: number) => Date.UTC(2026, 9, 31, 10) + seconds * 1000;

describe('SpanBuilder', () => {
  it('makes one span of the same window and closes it when another comes', () => {
    const builder = new SpanBuilder();
    expect(builder.feed(editor, at(0))).toBeNull();
    expect(builder.feed(editor, at(30))).toBeNull();
    const span = builder.feed(browser, at(60));
    expect(span).toMatchObject({
      app: 'code',
      appName: 'VS Code',
      startedAt: new Date(at(0)).toISOString(),
      endedAt: new Date(at(60)).toISOString(),
    });
    // The next span starts where this one ended.
    builder.feed(browser, at(90));
    expect(builder.flush()?.startedAt).toBe(new Date(at(60)).toISOString());
  });

  it('cuts a long span every five minutes', () => {
    const builder = new SpanBuilder();
    builder.feed(editor, at(0));
    const cut = builder.feed(editor, at(300));
    expect(cut?.endedAt).toBe(new Date(at(300)).toISOString());
    builder.feed(editor, at(330));
    expect(builder.flush()).toMatchObject({
      startedAt: new Date(at(300)).toISOString(),
      endedAt: new Date(at(330)).toISOString(),
    });
  });

  it('drops a window that only flashed by', () => {
    const builder = new SpanBuilder();
    builder.feed(editor, at(0));
    expect(builder.feed(browser, at(0.5))).toBeNull();
  });

  it('ends at "nothing to record", never before the span started', () => {
    const builder = new SpanBuilder();
    builder.feed(editor, at(100));
    expect(builder.feed(null, at(50))).toBeNull(); // Ended where it started: too short.
    builder.feed(editor, at(200));
    expect(builder.feed(null, at(260))?.endedAt).toBe(
      new Date(at(260)).toISOString(),
    );
    expect(builder.flush()).toBeNull();
  });

  it('cuts a too long title to what the server keeps', () => {
    const builder = new SpanBuilder();
    builder.feed({...editor, title: 'x'.repeat(600)}, at(0));
    // The same program with another title is another window: the long one closes.
    expect(builder.feed(editor, at(10))?.title).toHaveLength(500);
  });
});
