import {WritingIssue} from './writing';
import {applyFix, pieces} from './writing-text';

const issue = (offset: number, length: number): WritingIssue => ({
  offset,
  length,
  kind: 'spelling',
  message: '',
  replacements: [],
  ruleId: 'R',
});

describe('issue text', () => {
  it('cuts the text at the mistakes', () => {
    const text = 'я хачу чаю и кофэ';
    const parts = pieces(text, [issue(13, 4), issue(2, 4)]);
    expect(parts.map(part => [part.text, !!part.issue])).toEqual([
      ['я ', false],
      ['хачу', true],
      [' чаю и ', false],
      ['кофэ', true],
    ]);
  });

  it('moves the mistakes after a fix and drops the ones it touched', () => {
    const text = 'я хачу чаю и кофэ';
    const first = issue(2, 4);
    const last = issue(13, 4);
    const touched = issue(4, 4);
    const fixed = applyFix(text, [first, touched, last], first, 'хочу очень');
    expect(fixed.text).toBe('я хочу очень чаю и кофэ');
    expect(fixed.issues).toEqual([{...last, offset: 19}]);
  });
});
