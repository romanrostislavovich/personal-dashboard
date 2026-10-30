import {knowledgeMetadata} from './knowledge-meta';
import {safeKnowledgeMetadata} from '../shared/knowledge-meta';

describe('knowledge metadata allowlist', () => {
  it('extracts only page type and exact technology names', () => {
    document.head.innerHTML =
      '<meta property="og:type" content="article"><meta name="keywords" content="TypeScript, React, Jane Doe, jane@example.com, react, secret=123">';
    expect(knowledgeMetadata(document)).toEqual({
      type: 'article',
      technologies: ['TypeScript', 'React'],
    });
  });

  it('accepts schema.org microdata types but never parses arbitrary JSON-LD', () => {
    document.head.innerHTML =
      '<script type="application/ld+json">{"@type":"Person","name":"Jane","email":"jane@example.com","knowsAbout":"Python"}</script>';
    document.body.innerHTML =
      '<div itemscope itemtype="https://schema.org/TechArticle"><span itemprop="author">Jane</span></div>';
    expect(knowledgeMetadata(document)).toEqual({
      type: 'tech-article',
      technologies: [],
    });
    document.body.innerHTML =
      '<div itemscope itemtype="https://evil.example/Article"></div>';
    expect(knowledgeMetadata(document)).toEqual({
      type: undefined,
      technologies: [],
    });
  });

  it('rechecks content metadata at the trust boundary', () => {
    expect(
      safeKnowledgeMetadata({
        type: 'Person',
        title: 'Jane',
        email: 'jane@example.com',
        technologies: ['React', 'Jane Doe', 'Python token=123'],
      }),
    ).toEqual({technologies: ['React']});
    expect(
      safeKnowledgeMetadata({type: '__proto__', technologies: 'React'}),
    ).toEqual({});
    expect(safeKnowledgeMetadata(null)).toEqual({});
  });
});
