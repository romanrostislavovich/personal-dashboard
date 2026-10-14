/**
 * Reads the codes of a classification in ClaML — the XML WHO publishes ICD-10 in:
 *
 *   <Class code="F41.1" kind="category">
 *     <Rubric id="…" kind="preferred"><Label xml:lang="en">Generalized anxiety disorder</Label></Rubric>
 *     …
 *   </Class>
 *
 * Only categories (the codes a diagnosis is written with) are taken, not chapters or blocks;
 * the title is the preferred rubric with its inner markup dropped.
 */
export interface ClamlCode {
  code: string;
  title: string;
}

const CLASS = /<Class\b([^>]*)>([\s\S]*?)<\/Class>/g;
const PREFERRED = /<Rubric\b[^>]*\bkind="preferred"[^>]*>([\s\S]*?)<\/Rubric>/;
const LABEL = /<Label\b[^>]*>([\s\S]*?)<\/Label>/;

export function* clamlCodes(xml: string): Generator<ClamlCode> {
  for (const [, attributes, body] of xml.matchAll(CLASS)) {
    if (attribute(attributes, 'kind') !== 'category') {
      continue;
    }
    const code = attribute(attributes, 'code');
    const label = LABEL.exec(PREFERRED.exec(body)?.[1] ?? '')?.[1];
    if (code && label) {
      const title = decodeEntities(label.replace(/<[^>]+>/g, ''))
        .replace(/\s+/g, ' ')
        .trim();
      if (title) {
        yield { code, title };
      }
    }
  }
}

function attribute(attributes: string, name: string): string | undefined {
  return new RegExp(`\\b${name}="([^"]*)"`).exec(attributes)?.[1];
}

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => {
    if (name.startsWith('#x') || name.startsWith('#X')) {
      return String.fromCodePoint(parseInt(name.slice(2), 16));
    }
    if (name.startsWith('#')) {
      return String.fromCodePoint(parseInt(name.slice(1), 10));
    }
    return NAMED[name.toLowerCase()] ?? entity;
  });
}
