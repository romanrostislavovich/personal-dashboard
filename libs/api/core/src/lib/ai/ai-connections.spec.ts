import { hiddenFromShared } from './ai-connections.service';

describe('hiddenFromShared', () => {
  it('keeps the modules switched off', () => {
    expect(hiddenFromShared({ disabledModules: ['diary'] }, 'a')).toEqual(['diary']);
  });

  it('adds a module with a connection of its own', () => {
    expect(hiddenFromShared({ moduleConnections: { health: 'local' } }, 'cloud')).toEqual([
      'health',
    ]);
  });

  it('does not hide a module whose own connection is the active one', () => {
    expect(hiddenFromShared({ moduleConnections: { health: 'local' } }, 'local')).toEqual([]);
  });

  it('names a module once', () => {
    expect(
      hiddenFromShared(
        { disabledModules: ['health'], moduleConnections: { health: 'local' } },
        'cloud',
      ),
    ).toEqual(['health']);
  });
});
