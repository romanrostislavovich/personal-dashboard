import { exportable, ExportTable, ownership } from './export-catalog';

const table = (
  name: string,
  columns: string[],
  references: ExportTable['references'] = [],
): ExportTable => ({ name, columns, primaryKey: ['id'], references, binary: [] });

const accounts = table('games_accounts', ['id', 'user_id']);
const matches = table(
  'games_matches',
  ['id', 'account_id'],
  [{ column: 'account_id', table: 'games_accounts', target: 'id' }],
);
const heroes = table(
  'games_match_heroes',
  ['id', 'match_id'],
  [{ column: 'match_id', table: 'games_matches', target: 'id' }],
);
const rates = table('exchange_rates', ['id', 'day']);
const users = table('users', ['id', 'email']);
const secrets = table('user_secrets', ['id', 'user_id']);

describe('ownership', () => {
  const all = [accounts, matches, heroes, rates, users, secrets];
  const byName = new Map(all.map((item) => [item.name, item]));

  it('takes a table with user_id as the user’s own', () => {
    expect(ownership(accounts, byName)).toEqual({ kind: 'direct' });
  });

  it('follows references up to a table with user_id', () => {
    expect(ownership(heroes, byName)).toEqual({
      kind: 'through',
      reference: heroes.references[0],
      parent: { kind: 'through', reference: matches.references[0], parent: { kind: 'direct' } },
    });
  });

  it('leaves out what belongs to nobody, the accounts and the secrets', () => {
    expect(ownership(rates, byName)).toBeNull();
    expect(ownership(users, byName)).toBeNull();
    expect(ownership(secrets, byName)).toBeNull();
    expect(exportable(all).map(({ table: item }) => item.name)).toEqual([
      'games_accounts',
      'games_matches',
      'games_match_heroes',
    ]);
  });

  it('does not loop on tables that reference each other', () => {
    const a = table('a', ['id', 'b_id'], [{ column: 'b_id', table: 'b', target: 'id' }]);
    const b = table('b', ['id', 'a_id'], [{ column: 'a_id', table: 'a', target: 'id' }]);
    expect(
      ownership(
        a,
        new Map([
          ['a', a],
          ['b', b],
        ]),
      ),
    ).toBeNull();
  });
});
