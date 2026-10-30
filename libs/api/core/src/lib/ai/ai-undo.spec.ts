import {rowChanges} from './ai-undo';

describe('rowChanges', () => {
  it('tells the rows a call added and changed; key order does not matter', () => {
    const before = [
      {id: 'a', name: 'Garden', tags: []},
      {id: 'b', name: 'Kitchen', tags: ['home']},
    ];
    const after = [
      {name: 'Garden', id: 'a', tags: []},
      {id: 'b', name: 'Kitchen', tags: ['home', 'repair']},
      {id: 'c', name: 'Balcony', tags: []},
    ];
    expect(rowChanges('projects', before, after)).toEqual({
      table: 'projects',
      inserted: [after[2]],
      updated: [{before: before[1], after: after[1]}],
    });
  });

  it('is nothing when nothing was added or changed (deletions are the trash)', () => {
    expect(rowChanges('projects', [{id: 'a', name: 'x'}], [])).toBeNull();
  });
});
