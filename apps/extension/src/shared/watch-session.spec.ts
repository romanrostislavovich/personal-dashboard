import {
  mergeHints,
  takeReport,
  toViewInput,
  WATCH_GAP_MS,
  worthSending,
} from './watch-session';

const report = (position: number) => ({
  top: true,
  positionSeconds: position,
  durationSeconds: 6000,
  hints: null,
});
const page = {
  url: 'https://kinogo.ec/1-moana.html',
  site: 'kinogo.ec',
  hints: {pageTitle: 'Моана (2026)'},
};
let ids = 0;
const newId = () => `view-${++ids}`;

describe('watch sessions', () => {
  it('makes one view of the reports of one page, counting time by the clock', () => {
    let {open} = takeReport(null, report(0), page, 0, newId);
    for (let at = 15_000; at <= 600_000; at += 15_000) {
      open = takeReport(open, report(at / 1000), page, at, newId).open;
    }
    expect(open.watchedMs).toBe(600_000);
    expect(worthSending(open)).toBe(true);
    expect(toViewInput(open)).toMatchObject({
      site: 'kinogo.ec',
      watchedSeconds: 600,
      positionSeconds: 600,
      durationSeconds: 6000,
    });
    expect(JSON.stringify(toViewInput(open))).not.toContain('1-moana');
  });

  it('counts two frames playing at once only once', () => {
    let {open} = takeReport(null, report(0), page, 0, newId);
    open = takeReport(open, report(15), page, 15_000, newId).open;
    // The film's frame and an advert's report a moment apart.
    open = takeReport(open, report(15), page, 15_500, newId).open;
    open = takeReport(open, report(30), page, 30_000, newId).open;
    expect(open.watchedMs).toBe(30_000);
  });

  it('closes a view after a long pause or on another page', () => {
    const first = takeReport(null, report(0), page, 0, newId).open;
    const later = takeReport(first, report(0), page, WATCH_GAP_MS + 1, newId);
    expect(later.closed?.id).toBe(first.id);
    expect(later.open.id).not.toBe(first.id);
    const other = takeReport(
      later.open,
      report(0),
      {...page, url: 'https://kinogo.ec/2'},
      WATCH_GAP_MS + 2,
      newId,
    );
    expect(other.closed?.id).toBe(later.open.id);
  });

  it('keeps a hint read later and ignores an empty one', () => {
    expect(
      mergeHints({pageTitle: 'Netflix'}, {playerTitle: 'Dune', pageTitle: ' '}),
    ).toEqual({
      pageTitle: 'Netflix',
      playerTitle: 'Dune',
    });
  });

  it('does not send a trailer', () => {
    let {open} = takeReport(null, report(0), page, 0, newId);
    open = takeReport(open, report(15), page, 120_000, newId).open;
    expect(worthSending(open)).toBe(false);
  });
});
