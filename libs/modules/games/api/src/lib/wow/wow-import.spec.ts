import {WowAccountCharacter} from '@pd/contracts';
import {describe, expect, it} from 'vitest';
import {foundStatuses, ImportRow, planImport} from './wow-import';

const priest: WowAccountCharacter = {
  id: 7,
  region: 'eu',
  version: 'retail',
  name: 'Массоночка',
  surname: null,
  realm: 'Вечная Песня',
  realmSlug: 'eversong',
  slug: 'массоночка',
  level: 80,
  className: 'Жрец',
};
const paladin: WowAccountCharacter = {
  id: 3431914,
  region: 'eu',
  version: 'forever',
  name: 'Око',
  surname: 'Масонское',
  realm: null,
  realmSlug: null,
  slug: 'око-масонское',
  level: 38,
  className: 'Паладин',
};
const twink: WowAccountCharacter = {
  ...priest,
  id: 8,
  name: 'Twink',
  slug: 'twink',
  level: 3,
};
const everywhere = new Set(['eu/retail', 'eu/forever']);

function row(over: Partial<ImportRow>): ImportRow {
  return {
    id: 'r1',
    externalId: 'eu/eversong/массоночка',
    blizzardKey: null,
    notOnAccountSince: null,
    ...over,
  };
}

describe('planImport', () => {
  it('adds new characters from level 10, Forever by its name and surname', () => {
    const plan = planImport(
      [priest, paladin, twink],
      [],
      new Set(),
      everywhere,
    );
    expect(plan.add.map(a => a.externalId)).toEqual([
      'eu/eversong/массоночка',
      'eu//око-масонское/forever',
    ]);
  });

  it('links a character added by hand instead of adding it twice', () => {
    const plan = planImport([priest], [row({})], new Set(), everywhere);
    expect(plan.add).toEqual([]);
    expect(plan.link).toEqual([
      {
        rowId: 'r1',
        blizzardKey: 'eu/retail/7',
        externalId: 'eu/eversong/массоночка',
      },
    ]);
  });

  it('follows a renamed character by its Blizzard id', () => {
    const plan = planImport(
      [{...priest, name: 'Новое', slug: 'новое'}],
      [row({blizzardKey: 'eu/retail/7'})],
      new Set(),
      everywhere,
    );
    expect(plan.add).toEqual([]);
    expect(plan.link[0].externalId).toBe('eu/eversong/новое');
  });

  it('never brings back a character the owner removed', () => {
    const plan = planImport([priest], [], new Set(['eu/retail/7']), everywhere);
    expect(plan.add).toEqual([]);
  });

  it('marks a character gone from the account, and back when it returns', () => {
    const gone = planImport(
      [],
      [row({blizzardKey: 'eu/retail/7'})],
      new Set(),
      everywhere,
    );
    expect(gone.gone).toEqual(['r1']);

    const back = planImport(
      [priest],
      [row({blizzardKey: 'eu/retail/7', notOnAccountSince: new Date()})],
      new Set(),
      everywhere,
    );
    expect(back.back).toEqual(['r1']);
  });

  it('hides nothing when a region did not answer', () => {
    const plan = planImport(
      [],
      [row({blizzardKey: 'eu/retail/7'})],
      new Set(),
      new Set(['eu/forever']),
    );
    expect(plan.gone).toEqual([]);
  });

  it('leaves characters added by hand alone', () => {
    const plan = planImport([], [row({})], new Set(), everywhere);
    expect(plan.gone).toEqual([]);
  });
});

describe('foundStatuses', () => {
  it('tells which characters are on the page, hidden or removed', () => {
    const statuses = foundStatuses(
      [priest, paladin, twink],
      [row({})],
      new Set(['eu/forever/3431914']),
    );
    expect(statuses.map(s => [s.key, s.status])).toEqual([
      ['eu/retail/7', 'added'],
      ['eu/forever/3431914', 'removed'],
      ['eu/retail/8', 'hidden'],
    ]);
  });
});
