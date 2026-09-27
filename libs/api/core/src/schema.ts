// Core tables only, without Nest. A separate entry point lets module schemas
// be imported into drizzle-kit (migration generation) without bootstrapping the whole core.
export * from './lib/users/users.schema';
export * from './lib/projects/projects.schema';
export * from './lib/secrets/secrets.schema';
export * from './lib/achievements/achievements.schema';
export * from './lib/ai/ai.schema';
