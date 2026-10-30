import type {TelemetryBucket} from '@pd/contracts';

type Metadata = Pick<
  NonNullable<TelemetryBucket['page']>,
  'type' | 'technologies'
>;
const TYPES: Record<string, NonNullable<Metadata['type']>> = {
  article: 'article',
  website: 'website',
  'video.other': 'video',
  Article: 'article',
  NewsArticle: 'article',
  TechArticle: 'tech-article',
  WebPage: 'website',
  VideoObject: 'video',
  Course: 'course',
  'tech-article': 'tech-article',
  video: 'video',
  course: 'course',
};
const TECHNOLOGIES = [
  'TypeScript',
  'JavaScript',
  'Python',
  'Rust',
  'Go',
  'Java',
  'Kotlin',
  'React',
  'Angular',
  'Vue',
  'Node.js',
  'PostgreSQL',
  'Docker',
  'Kubernetes',
] as const;

export function knowledgeType(value: unknown): Metadata['type'] {
  return typeof value === 'string' && Object.hasOwn(TYPES, value)
    ? TYPES[value]
    : undefined;
}

/** Exact vocabulary only: never return a page-provided name, author, email or description. */
export function technologyNames(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const names = values
    .slice(0, 50)
    .filter((value): value is string => typeof value === 'string');
  return TECHNOLOGIES.filter(name =>
    names.some(value => value.toLowerCase() === name.toLowerCase()),
  ).slice(0, 10);
}

export function safeKnowledgeMetadata(value: unknown): Metadata {
  if (!value || typeof value !== 'object') return {};
  const candidate = value as Record<string, unknown>;
  const type = knowledgeType(candidate['type']);
  const technologies = technologyNames(candidate['technologies']);
  return {
    ...(type ? {type} : {}),
    ...(technologies.length ? {technologies} : {}),
  };
}
