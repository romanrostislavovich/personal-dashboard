import { canonicalJson, digestChanges } from './digest-changes';
import { DigestSection } from './digest-section';

const section = (id: string, always = false): DigestSection => ({
  id,
  module: id.split('.')[0],
  description: id,
  collect: async () => null,
  always,
});

const weather = section('weather.today', true);
const repos = section('github-oss.repos');
const sites = section('monitoring.sites');

describe('digestChanges', () => {
  it('keeps only sections whose facts changed since the last digest', () => {
    const changes = digestChanges(
      [
        { section: repos, facts: [{ fullName: 'a/b', stars: 11 }] },
        { section: sites, facts: [{ url: 'https://x.com', status: 'up' }] },
      ],
      new Map<string, unknown>([
        ['github-oss.repos', [{ fullName: 'a/b', stars: 10 }]],
        ['monitoring.sites', [{ status: 'up', url: 'https://x.com' }]],
      ]),
    );
    expect(changes).toEqual([
      {
        section: repos,
        facts: [{ fullName: 'a/b', stars: 11 }],
        previous: [{ fullName: 'a/b', stars: 10 }],
      },
    ]);
  });

  it('always includes the weather, and new sections with no previous facts', () => {
    const changes = digestChanges(
      [
        { section: weather, facts: { max: 20 } },
        { section: repos, facts: [] },
      ],
      new Map<string, unknown>([['weather.today', { max: 20 }]]),
    );
    expect(changes.map((change) => [change.section.id, change.previous])).toEqual([
      ['weather.today', { max: 20 }],
      ['github-oss.repos', null],
    ]);
  });

  it('skips empty sections, even the ones that always go', () => {
    expect(digestChanges([{ section: weather, facts: null }], new Map())).toEqual([]);
  });
});

describe('canonicalJson', () => {
  it('does not depend on the key order', () => {
    expect(canonicalJson({ b: 1, a: { d: [1, { f: 1, e: 2 }], c: null } })).toBe(
      canonicalJson({ a: { c: null, d: [1, { e: 2, f: 1 }] }, b: 1 }),
    );
  });
});
