import {ProjectTime, WorkPiece} from './project-context';

/** What is offered at all: less time next to a project tells nothing yet. */
const MIN_NEAR_SECONDS = 10 * 60;
/** Of a window's or a site's time, the part next to the project for it to be the project's. */
const MIN_SHARE = 0.5;
/** Without the AI only a site this much the project's is offered, with this much time. */
const SURE_SHARE = 0.8;
const SURE_SECONDS = 30 * 60;
/** Candidates shown to the AI at once: the ones with the most time. */
const MAX_CANDIDATES = 15;
const MAX_SUGGESTIONS = 5;

/** A window or a site of no project that keeps turning up in work on one. */
export interface SuggestionCandidate {
  kind: 'window' | 'site';
  /** The program of a window. */
  app: string | null;
  /** The title of a window, or the site. */
  label: string;
  /** Its time next to work on the project. */
  nearSeconds: number;
  /** All of its time in the days looked at. */
  totalSeconds: number;
}

/** A rule to offer. */
export interface NewSuggestion {
  pattern: string;
  kind: 'window' | 'site';
  seconds: number;
  reason: string | null;
}

const keyOf = (piece: Pick<WorkPiece, 'kind' | 'app' | 'label'>) =>
  `${piece.kind}\n${piece.app ?? ''}\n${piece.label}`;
const seconds = (piece: WorkPiece) => (piece.end - piece.start) / 1000;

/**
 * The windows and sites mostly seen next to work on the project (see projectTime): a site
 * open everywhere (a search engine) is next to every project, so it is left out by its share.
 */
export function suggestionCandidates(
  pieces: readonly WorkPiece[],
  time: ProjectTime,
): SuggestionCandidate[] {
  const total = new Map<string, number>();
  for (const piece of pieces) {
    if (piece.projectId === null && !piece.leisure && piece.label.trim()) {
      total.set(keyOf(piece), (total.get(keyOf(piece)) ?? 0) + seconds(piece));
    }
  }
  const near = new Map<string, {piece: WorkPiece; seconds: number}>();
  for (const piece of time.context) {
    if (!piece.label.trim()) {
      continue;
    }
    const known = near.get(keyOf(piece)) ?? {piece, seconds: 0};
    known.seconds += seconds(piece);
    near.set(keyOf(piece), known);
  }
  return [...near.entries()]
    .map(([key, {piece, seconds: nearSeconds}]) => ({
      kind: piece.kind,
      app: piece.app,
      label: piece.label,
      nearSeconds: Math.round(nearSeconds),
      totalSeconds: Math.round(total.get(key) ?? nearSeconds),
    }))
    .filter(
      item =>
        item.nearSeconds >= MIN_NEAR_SECONDS &&
        item.nearSeconds >= item.totalSeconds * MIN_SHARE,
    )
    .sort((a, b) => b.nearSeconds - a.nearSeconds)
    .slice(0, MAX_CANDIDATES);
}

/** Without the AI: only sites that are surely the project's (a local app on its port). */
export function sureSuggestions(
  candidates: readonly SuggestionCandidate[],
  taken: ReadonlySet<string>,
): NewSuggestion[] {
  return candidates
    .filter(
      item =>
        item.kind === 'site' &&
        item.nearSeconds >= SURE_SECONDS &&
        item.nearSeconds >= item.totalSeconds * SURE_SHARE &&
        !taken.has(item.label.toLowerCase()),
    )
    .slice(0, MAX_SUGGESTIONS)
    .map(item => ({
      pattern: item.label,
      kind: item.kind,
      seconds: item.nearSeconds,
      reason: null,
    }));
}

/**
 * The AI's answer, checked: a pattern must be a part of a candidate it is given for, long
 * enough to mean something, not a rule or an offer already, and — over all the windows and
 * sites it would match — still mostly next to the project (`shareOf`), so "Chrome" taken from
 * a title does not make every page the project's. `null` — the answer is not usable.
 */
export function parseSuggestions(
  answer: string,
  candidates: readonly SuggestionCandidate[],
  taken: ReadonlySet<string>,
  shareOf: (pattern: string) => {near: number; total: number},
): NewSuggestion[] | null {
  let raw: unknown;
  try {
    raw = JSON.parse(
      answer.slice(answer.indexOf('{'), answer.lastIndexOf('}') + 1),
    );
  } catch {
    return null;
  }
  const items = (raw as {suggestions?: unknown})?.suggestions;
  if (!Array.isArray(items)) {
    return null;
  }
  const seen = new Set(taken);
  const result: NewSuggestion[] = [];
  for (const item of items as Record<string, unknown>[]) {
    const candidate = candidates.find(one => one.label === item['label']);
    const pattern =
      typeof item['pattern'] === 'string' ? item['pattern'].trim() : '';
    const lower = pattern.toLowerCase();
    if (
      !candidate ||
      pattern.length < 3 ||
      pattern.length > 100 ||
      !candidate.label.toLowerCase().includes(lower) ||
      seen.has(lower)
    ) {
      continue;
    }
    const {near, total} = shareOf(lower);
    if (near < MIN_NEAR_SECONDS || near < total * MIN_SHARE) {
      continue;
    }
    seen.add(lower);
    result.push({
      pattern,
      kind: candidate.kind,
      seconds: Math.round(near),
      reason:
        typeof item['reason'] === 'string'
          ? item['reason'].trim().slice(0, 300)
          : null,
    });
  }
  return result.slice(0, MAX_SUGGESTIONS);
}

/** How much of the time a pattern would match is next to the project. */
export function patternShare(
  pieces: readonly WorkPiece[],
  time: ProjectTime,
): (pattern: string) => {near: number; total: number} {
  const context = new Set(time.context);
  return pattern => {
    let near = 0;
    let total = 0;
    for (const piece of pieces) {
      if (
        piece.projectId !== null ||
        piece.leisure ||
        !piece.label.toLowerCase().includes(pattern)
      ) {
        continue;
      }
      total += seconds(piece);
      if (context.has(piece)) {
        near += seconds(piece);
      }
    }
    return {near, total};
  };
}
