import { knowledgeType, technologyNames } from '../shared/knowledge-meta';

/** Only declarative types and exact technology keywords; no JSON-LD is parsed. */
export function knowledgeMetadata(document: Document) {
  const og = document.querySelector('meta[property="og:type"]')?.getAttribute('content');
  let type = knowledgeType(og);
  for (const element of Array.from(document.querySelectorAll('[itemscope][itemtype]')).slice(
    0,
    20,
  )) {
    const itemtype = element.getAttribute('itemtype') ?? '';
    const match = /^https?:\/\/schema\.org\/([A-Za-z]+)$/.exec(itemtype);
    type ??= knowledgeType(match?.[1]);
  }
  const keywords = (
    document.querySelector('meta[name="keywords"]')?.getAttribute('content') ?? ''
  ).slice(0, 1000);
  return { type, technologies: technologyNames(keywords.split(',').map((word) => word.trim())) };
}
