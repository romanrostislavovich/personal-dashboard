import { toContent } from './share-target';

describe('toContent', () => {
  it('puts the title of a page shared from a browser before its link', () => {
    expect(toContent({ text: 'https://example.com/a', subject: 'An article' })).toEqual({
      kind: 'text',
      text: 'An article https://example.com/a',
    });
    // A text that holds its subject already is left as it is.
    expect(toContent({ text: 'Dune https://netflix.com/1', subject: 'Dune' })).toEqual({
      kind: 'text',
      text: 'Dune https://netflix.com/1',
    });
  });

  it('makes a file of a picture, and nothing of an empty share', () => {
    const shared = toContent({ image: btoa('png-bytes'), mimeType: 'image/png' });
    expect(shared?.kind).toBe('image');
    expect(shared?.kind === 'image' && shared.image.type).toBe('image/png');
    expect(toContent({ text: '  ' })).toBeNull();
  });
});
