// Public API of the core for modules. Anything not exported here is an internal detail.
export * from './lib/core.module';
export * from './lib/config/env';
export { DB, type Database } from './lib/database/database.module';
export * from './lib/database/pg-errors';
export * from './lib/auth/current-user.decorator';
export * from './lib/auth/public.decorator';
export * from './lib/validation/zod-validation.pipe';
export * from './lib/users/users.schema';
export * from './lib/users/users.service';
export * from './lib/projects/projects.schema';
export * from './lib/projects/projects.service';
export * from './lib/scheduler/scheduler.service';
export * from './lib/search/search.service';
export * from './lib/life/life.service';
export * from './lib/automations/automations.service';
export { SystemLogger } from './lib/system/system-logger';
export * from './lib/secrets/secrets.service';
export * from './lib/notifications/notification-channel';
export * from './lib/notifications/notifications.service';
export * from './lib/notifications/telegram/bot-command';
export { TelegramBotService } from './lib/notifications/telegram/telegram-bot.service';
export * from './lib/achievements/achievement-metric';
export { AchievementsService } from './lib/achievements/achievements.service';
export * from './lib/ai/ai-tool';
export { AiService } from './lib/ai/ai.service';
export * from './lib/ai/digest-section';
export { MorningDigestService } from './lib/ai/morning-digest.service';
export { ServerActions, type ServerActionHandler } from './lib/sync/server-actions';
export {
  pickMessages,
  toLocale,
  localize,
  FALLBACK_LOCALE,
  type LocalizedText,
} from './lib/i18n/locale';
export { DataExportService } from './lib/data-export/data-export.service';
export type { ReadableExport, ReadableFile } from './lib/data-export/data-export.service';
export { csvLine } from './lib/data-export/data-archive';
export { SecurityService } from './lib/security/security.service';
export type { FoundProblem, Inspection, SecuritySource } from './lib/security/security-source';
export { OtherComputersService } from './lib/computer-time/other-computers.service';
export {
  assertPublicHost,
  OutboundBlockedError,
  privateAddressesAllowed,
  safeFetch,
} from './lib/net/outbound';
export { IntegrationsService } from './lib/integrations/integrations.service';
export type { IntegrationSource } from './lib/integrations/integrations.service';
export type { IntegrationReport } from './lib/integrations/integration-state';
export { DemoService } from './lib/demo/demo.service';
export type { DemoContext, DemoSeed } from './lib/demo/demo.service';
export { LinksService } from './lib/links/links.service';
export type {
  AppPage,
  DailyMetricSource,
  MomentSource,
  PeopleSource,
  Period,
  ProjectRef,
  ProjectSource,
  TimeSpent,
  TimeSpentKind,
  TimeSpentSource,
  UsageSource,
} from './lib/links/links.service';
export { ProjectOverviewService } from './lib/links/project-overview.service';
export { MOOD_METRIC } from './lib/links/mood-insights';
export type {
  OtherComputerDay,
  OtherComputerSource,
} from './lib/computer-time/other-computers.service';
