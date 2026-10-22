import { projectTime, WorkPiece } from './project-context';
import {
  parseSuggestions,
  patternShare,
  suggestionCandidates,
  sureSuggestions,
} from './rule-suggestions';

const MIN = 60_000;
const site = (from: number, to: number, label: string): WorkPiece => ({
  start: from * MIN,
  end: to * MIN,
  kind: 'site',
  app: null,
  label,
  projectId: null,
  leisure: false,
});
const own = (from: number, to: number): WorkPiece => ({
  ...site(from, to, 'main.ts — personal-dashboard'),
  kind: 'window',
  app: 'code',
  projectId: 'p',
});

// Work on the project 0–30, 38–60, 68–90; the app on localhost:4200 in both breaks; google.com
// for long elsewhere, and another app on localhost:5000 far from the project.
const pieces = [
  own(0, 30),
  site(30, 38, 'localhost:4200'),
  own(38, 60),
  site(60, 68, 'localhost:4200'),
  own(68, 90),
  site(200, 260, 'google.com'),
  site(300, 400, 'localhost:5000'),
];
const time = projectTime(pieces, 'p', []);

describe('suggestionCandidates', () => {
  it('offers what is mostly next to the project, not what is open everywhere', () => {
    expect(suggestionCandidates(pieces, time)).toEqual([
      { kind: 'site', app: null, label: 'localhost:4200', nearSeconds: 960, totalSeconds: 960 },
    ]);
  });
});

describe('sureSuggestions', () => {
  it('offers without the AI only a site with enough time', () => {
    const candidates = [
      {
        kind: 'site' as const,
        app: null,
        label: 'localhost:4200',
        nearSeconds: 3600,
        totalSeconds: 3700,
      },
      {
        kind: 'site' as const,
        app: null,
        label: 'localhost:3000',
        nearSeconds: 600,
        totalSeconds: 600,
      },
    ];
    expect(sureSuggestions(candidates, new Set()).map((item) => item.pattern)).toEqual([
      'localhost:4200',
    ]);
    expect(sureSuggestions(candidates, new Set(['localhost:4200']))).toEqual([]);
  });
});

describe('parseSuggestions', () => {
  const candidates = suggestionCandidates(pieces, time);
  const share = patternShare(pieces, time);

  it('takes a pattern that is a part of its candidate', () => {
    const answer =
      'Sure: {"suggestions":[{"label":"localhost:4200","pattern":"localhost:4200","reason":"The app being written"}]}';
    expect(parseSuggestions(answer, candidates, new Set(), share)).toEqual([
      { pattern: 'localhost:4200', kind: 'site', seconds: 960, reason: 'The app being written' },
    ]);
  });

  it('turns away a made-up pattern, a taken one, and one that matches too much', () => {
    const answer = JSON.stringify({
      suggestions: [
        { label: 'localhost:4200', pattern: 'dashboard-app' },
        { label: 'nothing.com', pattern: 'nothing' },
        // "localhost" is also the other app, far from the project.
        { label: 'localhost:4200', pattern: 'localhost' },
      ],
    });
    expect(parseSuggestions(answer, candidates, new Set(), share)).toEqual([]);
    const taken = JSON.stringify({
      suggestions: [{ label: 'localhost:4200', pattern: 'localhost:4200' }],
    });
    expect(parseSuggestions(taken, candidates, new Set(['localhost:4200']), share)).toEqual([]);
    expect(parseSuggestions('no json', candidates, new Set(), share)).toBeNull();
  });
});
