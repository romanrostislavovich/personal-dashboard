import {forEachUser} from './for-each-user';

describe('forEachUser', () => {
  it('goes on after a user fails, and tells the failures at the end', async () => {
    const done: string[] = [];
    const run = forEachUser('test.job', ['a', 'b', 'c'], async user => {
      if (user === 'b') {
        throw new Error('token revoked');
      }
      done.push(user);
    });
    await expect(run).rejects.toThrow(
      '1 of 3 users failed; the first: token revoked',
    );
    expect(done).toEqual(['a', 'c']);
  });

  it('takes rows with an id, and is quiet when all went well', async () => {
    const done: string[] = [];
    await forEachUser('test.job', [{id: 'a'}, {id: 'b'}], async user => {
      done.push(user.id);
    });
    expect(done).toEqual(['a', 'b']);
  });
});
