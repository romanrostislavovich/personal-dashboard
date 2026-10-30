import {WritingIssue} from './writing';

/** A piece of the text, plain or a mistake, for the marks behind the editor. */
export interface TextPiece {
  text: string;
  issue: WritingIssue | null;
}

/** The text cut at the mistakes; overlapping ones keep the first. */
export function pieces(text: string, issues: WritingIssue[]): TextPiece[] {
  const sorted = [...issues].sort((a, b) => a.offset - b.offset);
  const result: TextPiece[] = [];
  let at = 0;
  for (const issue of sorted) {
    if (issue.offset < at || issue.offset + issue.length > text.length) {
      continue;
    }
    if (issue.offset > at) {
      result.push({text: text.slice(at, issue.offset), issue: null});
    }
    result.push({
      text: text.slice(issue.offset, issue.offset + issue.length),
      issue,
    });
    at = issue.offset + issue.length;
  }
  if (at < text.length) {
    result.push({text: text.slice(at), issue: null});
  }
  return result;
}

/**
 * A fix applied: the new text, and the other mistakes moved by the change (the ones it
 * touched are gone until the next check).
 */
export function applyFix(
  text: string,
  issues: WritingIssue[],
  fixed: WritingIssue,
  replacement: string,
): {text: string; issues: WritingIssue[]} {
  const end = fixed.offset + fixed.length;
  const shift = replacement.length - fixed.length;
  return {
    text: text.slice(0, fixed.offset) + replacement + text.slice(end),
    issues: issues.flatMap(issue => {
      if (issue === fixed) {
        return [];
      }
      if (issue.offset + issue.length <= fixed.offset) {
        return [issue];
      }
      return issue.offset >= end
        ? [{...issue, offset: issue.offset + shift}]
        : [];
    }),
  };
}
