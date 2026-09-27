import { dependencyOrder } from './sync-catalog';

const table = (name: string, references: string[] = []) => ({ name, references });

describe('dependencyOrder', () => {
  it('puts referenced tables first', () => {
    const order = dependencyOrder([
      table('finance_transactions', ['users', 'projects', 'finance_recurring_payments']),
      table('finance_recurring_payments', ['users', 'projects']),
      table('projects', ['users']),
      table('users'),
    ]).map((t) => t.name);
    expect(order).toEqual([
      'users',
      'projects',
      'finance_recurring_payments',
      'finance_transactions',
    ]);
  });

  it('ignores references outside the list and survives cycles', () => {
    const order = dependencyOrder([table('a', ['b', 'pgboss_job']), table('b', ['a'])]).map(
      (t) => t.name,
    );
    expect(order.sort()).toEqual(['a', 'b']);
  });
});
