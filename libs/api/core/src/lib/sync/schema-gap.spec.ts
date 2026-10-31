import {rowFit, schemaGap} from './schema-gap';

describe('sync across versions', () => {
  it('counts how far one side is ahead when the other is its start', () => {
    expect(schemaGap(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(0);
    expect(schemaGap(['a', 'b', 'c'], ['a'])).toBe(2);
    expect(schemaGap(['a'], ['a', 'b', 'c'])).toBe(-2);
    expect(schemaGap([], ['a'])).toBe(-1);
  });

  it('refuses histories that went apart', () => {
    expect(schemaGap(['a', 'b', 'x'], ['a', 'b', 'c'])).toBeNull();
    expect(schemaGap(['a', 'x'], ['a', 'b', 'c'])).toBeNull();
  });

  it('tells a row of a newer schema from an older one', () => {
    const columns = ['id', 'user_id', 'name'];
    expect(rowFit('{"id":1,"user_id":"u","name":"n"}', columns)).toBe('whole');
    expect(rowFit('{"id":1,"user_id":"u"}', columns)).toBe('partial');
    expect(rowFit('{"id":1,"user_id":"u","name":"n","new":2}', columns)).toBe(
      'newer',
    );
  });
});
