import { clamlCodes, decodeEntities } from './claml';

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<ClaML version="2.0.0">
  <Class code="V" kind="chapter">
    <Rubric id="c1" kind="preferred"><Label xml:lang="en">Mental and behavioural disorders</Label></Rubric>
  </Class>
  <Class code="F40-F48" kind="block">
    <Rubric id="b1" kind="preferred"><Label xml:lang="en">Neurotic disorders</Label></Rubric>
  </Class>
  <Class code="F41" kind="category">
    <SuperClass code="F40-F48"/>
    <SubClass code="F41.1"/>
    <Rubric id="r1" kind="preferred"><Label xml:lang="en">Other anxiety disorders</Label></Rubric>
    <Rubric id="r2" kind="note"><Label xml:lang="en">A note, not the title</Label></Rubric>
  </Class>
  <Class kind="category" code="F41.1" usage="aster">
    <Rubric kind="inclusion" id="r3"><Label xml:lang="en">Anxiety neurosis</Label></Rubric>
    <Rubric kind="preferred" id="r4">
      <Label xml:lang="en">Generalized
        anxiety <Reference>disorder</Reference> &amp; more</Label>
    </Rubric>
  </Class>
  <Class code="F99" kind="category"></Class>
</ClaML>`;

describe('clamlCodes', () => {
  it('takes the categories with their preferred titles', () => {
    expect([...clamlCodes(XML)]).toEqual([
      { code: 'F41', title: 'Other anxiety disorders' },
      { code: 'F41.1', title: 'Generalized anxiety disorder & more' },
    ]);
  });
});

describe('decodeEntities', () => {
  it('reads named and numeric entities', () => {
    expect(decodeEntities('a &lt;b&gt; &#233; &#x41; &unknown;')).toBe('a <b> é A &unknown;');
  });
});
