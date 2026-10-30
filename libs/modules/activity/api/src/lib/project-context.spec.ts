import {nearProject, projectTime, WorkPiece} from './project-context';
import {spanSeconds} from './time-spans';

const MIN = 60_000;
const span = (from: number, to: number) => ({start: from * MIN, end: to * MIN});
const piece = (
  from: number,
  to: number,
  projectId: string | null,
  {leisure = false, label = 'x'} = {},
): WorkPiece => ({
  ...span(from, to),
  kind: 'window',
  app: 'app',
  label,
  projectId,
  leisure,
});

describe('nearProject', () => {
  const anchors = [span(0, 30), span(35, 60), span(100, 120)];

  it('takes what overlaps work on the project or fills a short break in it', () => {
    expect(nearProject(span(20, 40), anchors)).toBe(true);
    expect(nearProject(span(30, 35), anchors)).toBe(true);
  });

  it('leaves what is in a long break, before or after all the work', () => {
    expect(nearProject(span(70, 80), anchors)).toBe(false);
    expect(nearProject(span(130, 140), anchors)).toBe(false);
  });
});

describe('projectTime', () => {
  it('gives the project the browser between two moments of its IDE', () => {
    const time = projectTime(
      [
        piece(0, 30, 'p', {label: 'main.ts — personal-dashboard'}),
        piece(30, 36, null, {label: 'localhost:4200'}),
        piece(36, 60, 'p'),
      ],
      'p',
      [],
    );
    expect(spanSeconds(time.spans)).toBe(60 * 60);
    expect(spanSeconds(time.fromContext)).toBe(6 * 60);
    expect(time.context.map(item => item.label)).toEqual(['localhost:4200']);
  });

  it('never takes leisure or another project, however near', () => {
    const time = projectTime(
      [
        piece(0, 30, 'p'),
        piece(30, 33, null, {leisure: true}),
        piece(33, 36, 'q'),
        piece(36, 60, 'p'),
      ],
      'p',
      [],
    );
    expect(spanSeconds(time.spans)).toBe(54 * 60);
    expect(time.context).toEqual([]);
  });

  it('counts the IDE of another computer once with the tracker, and tells what it adds', () => {
    // The tracker saw the project 0–30; WakaTime (a laptop) 20–50 and 58–60; a site between.
    const time = projectTime([piece(0, 30, 'p'), piece(52, 55, null)], 'p', [
      span(20, 50),
      span(58, 60),
    ]);
    expect(spanSeconds(time.spans)).toBe(55 * 60);
    expect(spanSeconds(time.fromCoding)).toBe(22 * 60);
    expect(spanSeconds(time.fromContext)).toBe(3 * 60);
  });
});
