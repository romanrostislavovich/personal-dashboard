import { cosine, documentText, hashOf, nearest, withTask } from './recall-math';

describe('search by meaning — the arithmetic', () => {
  it('measures how alike two vectors are', () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosine([1, 1], [2, 2])).toBeCloseTo(1);
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });

  it('keeps the closest above the threshold, the closest first', () => {
    const items = [
      { id: 'far', vector: [0, 1] },
      { id: 'near', vector: [1, 0.1] },
      { id: 'nearest', vector: [1, 0] },
    ];
    expect(nearest([1, 0], items, 2, 0.5).map((item) => item.id)).toEqual(['nearest', 'near']);
  });

  it('indexes the title, the date and the beginning of the text; the hash follows the text', () => {
    const item = { id: '1', title: 'Knee', text: 'x'.repeat(5000), date: '2026-10-17', link: null };
    expect(documentText(item).startsWith('Knee\n2026-10-17\nxxx')).toBe(true);
    expect(documentText(item)).toHaveLength(2000);
    expect(hashOf('a')).toBe(hashOf('a'));
    expect(hashOf('a')).not.toBe(hashOf('b'));
  });

  it('tells nomic-embed-text what a text is; other models get it as it is', () => {
    expect(withTask('nomic-embed-text', 'query', 'knee')).toBe('search_query: knee');
    expect(withTask('text-embedding-3-small', 'document', 'knee')).toBe('knee');
  });
});
