// Public API of the client core: shared by the web app, the desktop shell and future mobile apps.
export * from './lib/platform';
export * from './lib/session';
export * from './lib/api-client';
export * from './lib/outbox';
export * from './lib/core-api';
export * from './lib/realtime';
export * from './lib/locale';
export * from './lib/dashboard-client';
// Requests of the modules, like their types in @pd/contracts: every client gets all of them.
export * from './lib/modules/ai';
export * from './lib/modules/development';
export * from './lib/modules/diary';
export * from './lib/modules/finance';
export * from './lib/modules/games';
export * from './lib/modules/music';
export * from './lib/modules/small-modules';
export * from './lib/modules/tasks';
