import {describe, expect, it, vi} from 'vitest';
import {leftAlone} from './desktop-writing';

// vi.mock is hoisted above the import: the module sees no real Electron.
vi.mock('electron', () => ({
  app: {getPath: () => ''},
  BrowserWindow: class {},
  ipcMain: {handle: vi.fn()},
  screen: {},
}));

describe('leftAlone', () => {
  it('leaves terminals alone: their text is commands and output', () => {
    expect(leftAlone('windowsterminal', [])).toBe(true);
    expect(leftAlone('conhost', [])).toBe(true);
    expect(leftAlone('mintty', [])).toBe(true);
  });

  it('leaves browsers to the extension and the programs the user chose', () => {
    expect(leftAlone('chrome', [])).toBe(true);
    expect(leftAlone('telegram', ['telegram'])).toBe(true);
  });

  it('checks the other programs', () => {
    expect(leftAlone('winword', [])).toBe(false);
    expect(leftAlone('notepad', [])).toBe(false);
  });
});
