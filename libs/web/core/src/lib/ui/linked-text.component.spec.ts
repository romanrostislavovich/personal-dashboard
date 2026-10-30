import {linkParts} from './linked-text.component';

describe('linkParts', () => {
  it('finds the links and leaves the sentence its punctuation', () => {
    expect(
      linkParts('Size 42, see https://shop.example/p?id=1. Or http://a.b/c)'),
    ).toEqual([
      {text: 'Size 42, see ', href: null},
      {
        text: 'https://shop.example/p?id=1',
        href: 'https://shop.example/p?id=1',
      },
      {text: '. Or ', href: null},
      {text: 'http://a.b/c', href: 'http://a.b/c'},
      {text: ')', href: null},
    ]);
  });

  it('takes no other schemes and keeps a text without links whole', () => {
    expect(linkParts('javascript:alert(1) and ftp://x')).toEqual([
      {text: 'javascript:alert(1) and ftp://x', href: null},
    ]);
  });
});
