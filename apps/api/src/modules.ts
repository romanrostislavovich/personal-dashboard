import { BirthdaysModule } from '@pd/birthdays-api';
import { FinanceModule } from '@pd/finance-api';
import { GithubOssModule } from '@pd/github-oss-api';

/**
 * Включённые модули дашборда (бэкенд-часть).
 * Чтобы отключить модуль — убери его из списка (и из apps/web/src/app/modules.ts).
 */
export const enabledModules = [BirthdaysModule, FinanceModule, GithubOssModule];
